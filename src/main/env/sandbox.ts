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
 * service's mapping with a freshly-allocated host port. Everything else
 * (bind-mount of `.`, named volumes) is already per-worktree because we run with
 * `--project-directory <worktree>` and a unique `-p` project name.
 */
function buildOverride(env: ProjectEnvConfig, hostPorts: Record<string, number>): string {
  const lines = ['services:']
  for (const e of env.exposed) {
    lines.push(`  ${e.service}:`)
    lines.push('    ports: !override')
    lines.push(`      - "${hostPorts[e.service]}:${e.containerPort}"`)
  }
  return lines.join('\n') + '\n'
}

/**
 * Bring up the worktree's compose stack in its own isolated project and return a
 * handle for execing into the workspace service + tearing it down. Blocks until
 * services are healthy (`up --wait`), so the agent starts on a ready environment.
 */
export async function bootstrapSandbox(
  env: ProjectEnvConfig,
  worktreePath: string,
  projectName: string
): Promise<SandboxHandle> {
  if (!env.workspaceService) {
    throw new Error('Sandbox is enabled but no workspace service was detected in the compose file.')
  }

  const hostPorts: Record<string, number> = {}
  for (const e of env.exposed) hostPorts[e.service] = await freePort()

  const overrideDir = mkdtempSync(join(tmpdir(), 'harnext-sandbox-'))
  const overridePath = join(overrideDir, 'harnext.override.yml')
  writeFileSync(overridePath, buildOverride(env, hostPorts))

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
    await pExecFile(
      'docker',
      [...composeArgs, 'up', '-d', '--build', '--wait', '--wait-timeout', String(timeoutSec)],
      { timeout: (timeoutSec + 60) * 1000, maxBuffer: 32 * 1024 * 1024 }
    )

    const psq = await pExecFile('docker', [...composeArgs, 'ps', '-q', env.workspaceService])
    const container = psq.stdout.trim().split('\n').filter(Boolean)[0]
    if (!container) throw new Error(`workspace service "${env.workspaceService}" has no container`)

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
