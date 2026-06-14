import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type {
  ComposeService,
  DockerStatus,
  EnvOverrides,
  ExposedService,
  ProjectEnvConfig
} from '../../shared/types'

const pExecFile = promisify(execFile)

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

/**
 * Run a command and capture its output. Never throws — a non-zero exit (or a
 * missing binary) comes back as `{ code }` so callers can branch on it. Detection
 * shells out to `docker`, which may be absent or slow to answer (a starting
 * daemon), so everything here is async + time-boxed to avoid freezing the UI.
 */
async function run(
  cmd: string,
  args: string[],
  cwd?: string,
  timeoutMs = 15_000
): Promise<RunResult> {
  try {
    const { stdout, stderr } = await pExecFile(cmd, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true
    })
    return { code: 0, stdout, stderr }
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string; message?: string }
    return {
      code: typeof e.code === 'number' ? e.code : 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? e.message ?? ''
    }
  }
}

/** Probe the host for Docker and which Compose flavor (if any) is available. */
export async function getDockerStatus(): Promise<DockerStatus> {
  const ver = await run('docker', ['--version'])
  if (ver.code !== 0) {
    return { installed: false, composeFlavor: null, daemonRunning: false, version: null }
  }
  let composeFlavor: 'v2' | 'v1' | null = null
  if ((await run('docker', ['compose', 'version'])).code === 0) composeFlavor = 'v2'
  else if ((await run('docker-compose', ['--version'])).code === 0) composeFlavor = 'v1'
  const daemonRunning = (await run('docker', ['info'])).code === 0
  return { installed: true, composeFlavor, daemonRunning, version: ver.stdout.trim() || null }
}

// Compose's own file-precedence order: the first match wins as the base file,
// and its sibling override (if present) is layered on top.
const COMPOSE_CANDIDATES = [
  'compose.yaml',
  'compose.yml',
  'docker-compose.yaml',
  'docker-compose.yml'
]
const OVERRIDE_CANDIDATES = [
  'compose.override.yaml',
  'compose.override.yml',
  'docker-compose.override.yaml',
  'docker-compose.override.yml'
]

function findComposeFiles(projectPath: string): string[] {
  const base = COMPOSE_CANDIDATES.find((f) => existsSync(join(projectPath, f)))
  if (!base) return []
  const files = [base]
  const override = OVERRIDE_CANDIDATES.find((f) => existsSync(join(projectPath, f)))
  if (override) files.push(override)
  return files
}

function hashFiles(projectPath: string, files: string[]): string {
  const h = createHash('sha256')
  for (const f of files) {
    h.update(f)
    try {
      h.update(readFileSync(join(projectPath, f)))
    } catch {
      /* file vanished between discovery and read — ignore */
    }
  }
  return 'sha256:' + h.digest('hex')
}

/** Common dependency dirs we keep in per-worktree volumes rather than on the host. */
function inferArtifactVolumes(projectPath: string): string[] {
  const has = (f: string): boolean => existsSync(join(projectPath, f))
  const vols: string[] = []
  if (has('package.json')) vols.push('node_modules')
  if (has('pyproject.toml') || has('requirements.txt')) vols.push('.venv')
  if (has('Cargo.toml')) vols.push('target')
  return vols
}

// Shape of a service inside `docker compose config --format json` output.
interface RawService {
  build?: unknown
  image?: string
  ports?: Array<{ target?: number; published?: string | number }>
  volumes?: Array<{ type?: string; source?: string }>
  healthcheck?: { disable?: boolean }
}

function parseServices(raw: Record<string, RawService>, projectPath: string): ComposeService[] {
  const root = resolve(projectPath)
  return Object.entries(raw).map(([name, svc]) => {
    // Only published ports (`ports:`) are host-facing forwarding candidates.
    // `expose:` keeps a service internal to the compose network, so we ignore it
    // here — internal dependencies (db, redis) shouldn't be forwarded to the host.
    const ports = [
      ...new Set(
        (svc.ports ?? []).map((p) => p.target).filter((t): t is number => typeof t === 'number')
      )
    ].sort((a, b) => a - b)
    // A bind mount of the project root marks a service that runs our source even
    // when it pulls a base image (the common `image: node` + `.:/app` dev pattern).
    const mountsSource = (svc.volumes ?? []).some(
      (v) => v.type === 'bind' && typeof v.source === 'string' && resolve(v.source) === root
    )
    return {
      name,
      build: svc.build !== undefined && svc.build !== null,
      image: typeof svc.image === 'string' ? svc.image : null,
      mountsSource,
      ports,
      hasHealthcheck: !!svc.healthcheck && svc.healthcheck.disable !== true
    }
  })
}

// Services with a published port are forwarded to the host. The primary (what the
// explorer opens) is the user's pick, else the workspace service's port, else the
// first exposed service.
function buildExposed(
  services: ComposeService[],
  workspace: string | null,
  primaryOverride?: string
): ExposedService[] {
  const exposed: ExposedService[] = services
    .filter((s) => s.ports.length > 0)
    .map((s) => ({ service: s.name, containerPort: s.ports[0], primary: false }))
  if (exposed.length === 0) return exposed
  let idx = primaryOverride ? exposed.findIndex((e) => e.service === primaryOverride) : -1
  if (idx < 0 && workspace) idx = exposed.findIndex((e) => e.service === workspace)
  exposed[idx >= 0 ? idx : 0].primary = true
  return exposed
}

/** A disabled, no-runtime config — the "behaves exactly like today" baseline. */
export function emptyEnvConfig(extra: Partial<ProjectEnvConfig> = {}): ProjectEnvConfig {
  return {
    enabled: false,
    runtime: 'none',
    composeFiles: [],
    sourceHash: null,
    workspaceService: null,
    exposed: [],
    services: [],
    artifactVolumes: [],
    initCommands: [],
    detectError: null,
    detectedAt: Date.now(),
    overrides: {},
    ...extra
  }
}

/**
 * Detect a project's Docker environment from its compose file(s). Resolution uses
 * `docker compose config --format json` (the canonical model — it merges overrides,
 * interpolates .env, expands extends/anchors) rather than hand-parsing YAML.
 *
 * Returns `enabled: true` (the recommended default) only when a compose stack is
 * found AND Docker Compose v2 + a running daemon can actually resolve it; otherwise
 * a disabled config carrying a `detectError` the UI can surface.
 */
export async function detectProjectEnv(
  projectPath: string,
  overrides: EnvOverrides = {}
): Promise<ProjectEnvConfig> {
  // User-specified compose file(s) take precedence over auto-discovery.
  const composeFiles =
    overrides.composeFiles && overrides.composeFiles.length
      ? overrides.composeFiles
      : findComposeFiles(projectPath)
  if (composeFiles.length === 0) return emptyEnvConfig({ overrides })

  const docker = await getDockerStatus()
  const sourceHash = hashFiles(projectPath, composeFiles)
  const artifactVolumes = inferArtifactVolumes(projectPath)
  const partial = (detectError: string): ProjectEnvConfig =>
    emptyEnvConfig({
      runtime: 'compose',
      composeFiles,
      sourceHash,
      artifactVolumes,
      detectError,
      overrides
    })

  const missing = composeFiles.filter((f) => !existsSync(join(projectPath, f)))
  if (missing.length) return partial(`Compose file not found: ${missing.join(', ')}`)

  if (!docker.installed) return partial('Docker is not installed.')
  if (docker.composeFlavor !== 'v2')
    return partial('Docker Compose v2 is required (the `docker compose` command).')
  if (!docker.daemonRunning) return partial('The Docker daemon is not running.')

  const fileArgs = composeFiles.flatMap((f) => ['-f', f])
  const res = await run(
    'docker',
    ['compose', ...fileArgs, 'config', '--format', 'json'],
    projectPath,
    20_000
  )
  if (res.code !== 0) {
    const tail = res.stderr.trim().split('\n').slice(-3).join(' ')
    return partial(`\`docker compose config\` failed: ${tail || 'unknown error'}`)
  }

  let services: ComposeService[]
  try {
    const parsed = JSON.parse(res.stdout) as { services?: Record<string, RawService> }
    services = parseServices(parsed.services ?? {}, projectPath)
  } catch {
    return partial('Could not parse `docker compose config` output.')
  }

  if (services.length === 0) return partial('No services found in the compose file.')

  const wsOverride = overrides.workspaceService
  const workspaceService =
    wsOverride && services.some((s) => s.name === wsOverride)
      ? wsOverride
      : (services.find((s) => s.build || s.mountsSource)?.name ?? null)
  return {
    enabled: true,
    runtime: 'compose',
    composeFiles,
    sourceHash,
    workspaceService,
    exposed: buildExposed(services, workspaceService, overrides.primaryService),
    services,
    artifactVolumes,
    initCommands: [],
    detectError: null,
    detectedAt: Date.now(),
    overrides
  }
}
