import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { ProjectEnvConfig } from '../../shared/types'
import { slugify } from '../git'

const pExecFile = promisify(execFile)

/** How long `up --wait` may take for services to become healthy. */
const HEALTH_TIMEOUT_SEC = 180

/** An Error tagged so callers can recognise an abort (mirrors AbortError). */
export function abortError(): Error {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' })
}

/**
 * `setTimeout` as a promise that rejects immediately if `signal` is (or becomes)
 * aborted — so a long readiness poll can be cancelled the moment Stop is pressed
 * during "Preparing environment" (#126).
 */
export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Container state probe — injectable so the readiness poll is unit-testable. */
export type InspectState = (container: string) => Promise<{ status?: string; health?: string }>

const dockerInspectState: InspectState = async (container) => {
  const insp = await pExecFile('docker', ['inspect', container])
  const info = (
    JSON.parse(insp.stdout) as Array<{
      State?: { Status?: string; Health?: { Status?: string } }
    }>
  )[0]
  return { status: info?.State?.Status, health: info?.State?.Health?.Status }
}

export interface SandboxHandle {
  /** `docker compose` project name — namespaces containers/networks/volumes per worktree. */
  projectName: string
  /** Workspace container id the agent execs into. */
  container: string
  /** Container-side working dir (the bind-mount target) — passed as `execCwd`. */
  execCwd: string
  /** service → allocated host port, for the explorer to preview. */
  hostPorts: Record<string, number>
  /** Idempotent: stops + removes the stack and cleans up the generated override. */
  teardown: () => Promise<void>
}

/** Allocate a free host port by binding to :0 and reading the assigned port. */
function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer()
    srv.once('error', rej)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => res(port))
    })
  })
}

/**
 * Per-worktree override: the base compose's published `ports:` would make every
 * worktree fight over the same host ports. `!override` replaces each exposed
 * service's mapping with a freshly-allocated host port, AND neutralizes any
 * fixed `container_name:` so two worktrees (or the user's own stack) don't
 * collide on a global container name (#117). A `container_name:` ignores the
 * compose project, so without this it stays global; resetting it lets docker
 * auto-name `<project>-<service>-N`, unique per worktree (we run a unique `-p`
 * project). Services reach each other by service name, so connectivity is
 * unaffected. Everything else (bind-mount of `.`, named volumes) is already
 * per-worktree via `--project-directory <worktree>` + the unique `-p` name.
 */
export function buildOverride(env: ProjectEnvConfig, hostPorts: Record<string, number>): string {
  const exposedBy = new Map(env.exposed.map((e) => [e.service, e]))
  // Every detected service appears so its `container_name:` (if any) is reset.
  const services = new Set<string>([
    ...env.services.map((s) => s.name),
    ...env.exposed.map((e) => e.service)
  ])
  const lines = ['services:']
  for (const name of services) {
    lines.push(`  ${name}:`)
    lines.push('    container_name: !reset null')
    const e = exposedBy.get(name)
    if (e) {
      lines.push('    ports: !override')
      lines.push(`      - "${hostPorts[name]}:${e.containerPort}"`)
    }
  }
  return lines.join('\n') + '\n'
}

/**
 * Poll a container until it's running and (if it declares a healthcheck) healthy.
 * Used instead of a whole-stack `up --wait`, which aborts the moment ANY container
 * in the project exits — even cleanly (exit 0) — which one-shot/short-lived
 * services (build, warmup, one-off workers) do by design.
 */
export interface ReadyOpts {
  /** Abort the poll promptly when the agent's bootstrap is cancelled (#126). */
  signal?: AbortSignal
  /** Container-state probe (default: `docker inspect`); injectable for tests. */
  inspect?: InspectState
  /** Inter-poll delay (default: abortableDelay); injectable for tests. */
  delay?: (ms: number, signal?: AbortSignal) => Promise<void>
}

export async function waitForContainerReady(
  container: string,
  service: string,
  timeoutMs: number,
  opts: ReadyOpts = {}
): Promise<void> {
  const inspect = opts.inspect ?? dockerInspectState
  const delay = opts.delay ?? abortableDelay
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (opts.signal?.aborted) throw abortError()
    let status: string | undefined
    let health: string | undefined
    try {
      ;({ status, health } = await inspect(container))
    } catch {
      /* not inspectable yet — retry until the deadline */
    }
    if (status === 'running' && (!health || health === 'healthy')) return
    if (status === 'exited' || status === 'dead') {
      throw new Error(`workspace service "${service}" ${status} before it became ready`)
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `workspace service "${service}" not ready within ${Math.round(timeoutMs / 1000)}s` +
          (health ? ` (health: ${health})` : '')
      )
    }
    await delay(1500, opts.signal)
  }
}

/**
 * Bring up the worktree's compose stack in its own isolated project and return a
 * handle for execing into the workspace service + tearing it down. Blocks until
 * the workspace container is ready, so the agent starts on a usable environment.
 */
export async function bootstrapSandbox(
  env: ProjectEnvConfig,
  worktreePath: string,
  projectName: string,
  /**
   * Secrets/env to interpolate (#123). The agent's worktree has no `.env` (it's
   * gitignored), so without this every `${VAR}` resolves to blank. Pass `content`
   * to materialize a temp env-file (used when inline secrets are present), or
   * `path` to point compose at an existing file verbatim. Either way it's fed via
   * `--env-file`, and `content` is written OUTSIDE the worktree so it can't be
   * committed.
   */
  envFile?: { path?: string; content?: string },
  /** Cancels the (often multi-minute) bootstrap when Stop is pressed (#126). */
  signal?: AbortSignal
): Promise<SandboxHandle> {
  if (!env.workspaceService) {
    throw new Error('Sandbox is enabled but no workspace service was detected in the compose file.')
  }

  const hostPorts: Record<string, number> = {}
  for (const e of env.exposed) hostPorts[e.service] = await freePort()

  const overrideDir = mkdtempSync(join(tmpdir(), 'harnext-sandbox-'))
  const overridePath = join(overrideDir, 'harnext.override.yml')
  writeFileSync(overridePath, buildOverride(env, hostPorts))

  // Materialize inline secrets to a temp env-file inside overrideDir (never the
  // worktree); an explicit path is used as-is. Cleaned up by teardown either way.
  let envFilePath: string | undefined
  if (envFile?.content != null && envFile.content !== '') {
    envFilePath = join(overrideDir, 'harnext.env')
    writeFileSync(envFilePath, envFile.content, { mode: 0o600 })
  } else if (envFile?.path) {
    envFilePath = envFile.path
  }

  // Base compose files resolved against the worktree; the generated override last.
  const fileArgs = [
    ...env.composeFiles.flatMap((f) => ['-f', join(worktreePath, f)]),
    '-f',
    overridePath
  ]
  const composeArgs = [
    'compose',
    '--project-directory',
    worktreePath,
    ...(envFilePath ? ['--env-file', envFilePath] : []),
    '-p',
    projectName,
    ...fileArgs
  ]

  const timeoutSec = HEALTH_TIMEOUT_SEC
  let torn = false
  const teardown = async (): Promise<void> => {
    if (torn) return
    torn = true
    try {
      await pExecFile('docker', [...composeArgs, 'down', '-v', '--remove-orphans'], {
        timeout: 120_000
      })
    } catch {
      /* best-effort — a half-up stack may not fully exist */
    } finally {
      try {
        rmSync(overrideDir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  }

  try {
    // Build + start the whole stack, but do NOT gate on `--wait` here: `docker
    // compose up --wait` aborts the moment ANY container in the project exits —
    // even cleanly (exit 0) — and real stacks have one-shot/short-lived services
    // (build, warmup, one-off workers) that exit by design. `up -d` still honours
    // depends_on ordering (incl. service_completed_successfully), so the
    // workspace only starts once its own dependencies are ready.
    if (signal?.aborted) throw abortError()
    // `{ signal }` kills the in-flight `compose up --build` child if Stop is
    // pressed, so a long build/pull doesn't have to finish first (#126).
    await pExecFile('docker', [...composeArgs, 'up', '-d', '--build'], {
      timeout: (timeoutSec + 60) * 1000,
      maxBuffer: 32 * 1024 * 1024,
      signal
    })

    const psq = await pExecFile('docker', [...composeArgs, 'ps', '-q', env.workspaceService])
    const container = psq.stdout.trim().split('\n').filter(Boolean)[0]
    if (!container) throw new Error(`workspace service "${env.workspaceService}" has no container`)

    // Gate readiness on the workspace container (where the agent execs) instead
    // of the whole stack, so an unrelated service exiting can't fail the sandbox.
    await waitForContainerReady(container, env.workspaceService, timeoutSec * 1000, { signal })

    // execCwd = where the worktree is mounted in the container (so the agent's
    // shell lands on the source). Prefer the bind mount's destination, then the
    // image's WORKDIR.
    let execCwd = '/'
    try {
      const insp = await pExecFile('docker', ['inspect', container])
      const info = (
        JSON.parse(insp.stdout) as Array<{
          Mounts?: Array<{ Source?: string; Destination?: string }>
          Config?: { WorkingDir?: string }
        }>
      )[0]
      const mount = info?.Mounts?.find(
        (m) => m.Source && resolve(m.Source) === resolve(worktreePath)
      )
      execCwd = mount?.Destination || info?.Config?.WorkingDir || '/'
    } catch {
      /* fall back to '/' */
    }

    return { projectName, container, execCwd, hostPorts, teardown }
  } catch (err) {
    await teardown()
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to start the Docker sandbox: ${msg}`)
  }
}

/** Stable, collision-resistant compose project name for a worktree. */
export function sandboxProjectName(projectPath: string, worktreePath: string): string {
  return `harnext-${slugify(basename(projectPath))}-${slugify(basename(worktreePath))}`
}
