// Statuses follow the design language: a running agent is Working; an idle
// agent is either awaiting Review (it changed code) or Needs input (it
// replied without changes); Merged/Failed are terminal; Paused = user abort.
export type AgentStatus = 'running' | 'review' | 'input' | 'done' | 'failed' | 'paused'

export type Role = 'user' | 'plan' | 'exec' | 'eval'

export type PermissionMode = 'acceptEdits' | 'plan' | 'bypassPermissions'

export type AgentMode = 'single' | 'goal'

export interface Project {
  id: number
  name: string
  path: string
  branch: string | null
  isGit: boolean
  lastOpenedAt: number
  createdAt: number
  /** Docker sandbox config, detected on add. null = never analyzed (pre-feature projects). */
  envConfig: ProjectEnvConfig | null
}

// ── project environment / docker sandbox ─────────────────────────────
export type SandboxRuntime = 'compose' | 'none'

export interface ComposeService {
  name: string
  /** built from the repo (a `build:` stanza) vs pulled from a registry (`image:` only) */
  build: boolean
  image: string | null
  /** bind-mounts the project root — the other signal that this service runs our code */
  mountsSource: boolean
  /** published (host-facing) container ports from `ports:` — forwarding candidates */
  ports: number[]
  hasHealthcheck: boolean
}

export interface ExposedService {
  service: string
  containerPort: number
  /** the service the explorer opens by default */
  primary: boolean
}

/** User-specified config that overrides auto-detection and survives re-detect. */
export interface EnvOverrides {
  /** Explicit compose file(s), relative to the project root, instead of auto-discovery. */
  composeFiles?: string[]
  /** Force which service is the workspace (gets the bind-mount + the agent's shell). */
  workspaceService?: string
  /** Force which exposed service the explorer opens by default. */
  primaryService?: string
}

export interface ProjectEnvConfig {
  /** Master switch. false → the project runs exactly as today (host execution, no Docker). */
  enabled: boolean
  runtime: SandboxRuntime
  /** compose files, relative to the project root, in `-f` order */
  composeFiles: string[]
  /** sha256 of the compose files at detection time; lets us spot drift on re-open */
  sourceHash: string | null
  /** the service the agent edits / execs into — gets the source bind-mount */
  workspaceService: string | null
  /** services + ports forwarded to a host port and shown in the explorer */
  exposed: ExposedService[]
  /** every detected service, for display */
  services: ComposeService[]
  /** dirs inside the workspace container kept in per-worktree volumes (node_modules, .venv, …) */
  artifactVolumes: string[]
  /** commands run once, after services are healthy (migrate/seed) */
  initCommands: string[]
  /** non-empty when detection couldn't fully resolve the compose config */
  detectError: string | null
  detectedAt: number
  /** user-specified config that overrides detection (compose file, workspace, preview) */
  overrides?: EnvOverrides
}

export interface DockerStatus {
  installed: boolean
  /** 'v2' = `docker compose`; 'v1' = legacy `docker-compose`; null = neither */
  composeFlavor: 'v2' | 'v1' | null
  daemonRunning: boolean
  version: string | null
}

export interface SandboxPort {
  service: string
  /** Host URL the forwarded service is reachable at, e.g. http://localhost:49210 */
  url: string
  /** The one the explorer opens by default. */
  primary: boolean
}

/** Live state of an agent's per-worktree Docker sandbox (in-memory; not persisted). */
export interface SandboxInfo {
  status: 'off' | 'preparing' | 'ready' | 'failed'
  primaryUrl: string | null
  ports: SandboxPort[]
}

export interface AgentMeta {
  id: string
  projectId: number
  title: string
  status: AgentStatus
  mode: AgentMode
  modelId: string | null
  smartModel: string | null
  execModel: string | null
  permissionMode: PermissionMode
  branch: string | null
  worktreePath: string | null
  progress: string
  error: string | null
  live: boolean
  add: number
  del: number
  createdAt: number
  updatedAt: number
}

export interface MessageItem {
  kind: 'message'
  seq: number
  role: Role
  content: string
  /** evaluator verdict when role === 'eval' */
  verdict: 'approve' | 'revise' | null
  /** Attached images (data URLs) on a user message, for the transcript. */
  images?: string[]
  createdAt: number
}

export interface ToolCallItem {
  kind: 'tool'
  seq: number
  role: Role
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  result: string | null
  isError: boolean
  startedAt: number
  endedAt: number | null
}

export type TimelineItem = MessageItem | ToolCallItem

// ── worktree diff ────────────────────────────────────────────────────
export interface DiffLine {
  t: 'ctx' | 'add' | 'del'
  o: number | null
  n: number | null
  c: string
}

export interface DiffHunk {
  label: string
  lines: DiffLine[]
}

export interface DiffFile {
  path: string
  badge: 'new' | 'mod' | 'del'
  add: number
  del: number
  hunks: DiffHunk[]
}

export interface WorktreeDiff {
  files: DiffFile[]
  add: number
  del: number
}

// ── loops ────────────────────────────────────────────────────────────
export type LoopType = 'interval' | 'daily' | 'weekly'

export interface LoopConfig {
  /** hours, for interval loops (legacy — prefer intervalMinutes) */
  intervalHours?: number
  /** minutes between runs, for interval loops (supports sub-hour, e.g. 30) */
  intervalMinutes?: number
  /** "HH:MM" (any minute), for daily/weekly loops */
  time?: string
  /** 0 = Monday … 6 = Sunday, for weekly loops (legacy — prefer days) */
  day?: number
  /** weekdays a weekly loop fires on (0 = Monday … 6 = Sunday) */
  days?: number[]
  /** Model this loop pins, independent of the global default. Unset = follow default. */
  model?: string
  /** Provider this loop pins. Unset = follow the global default provider. */
  provider?: string
}

export interface LoopMeta {
  id: number
  projectId: number
  title: string
  prompt: string
  type: LoopType
  config: LoopConfig
  cadence: string
  status: 'active' | 'paused'
  lastRunAt: number | null
  nextRunAt: number | null
  runs: number
  createdAt: number
}

export interface LoopRun {
  id: number
  loopId: number
  agentId: string | null
  status: 'done' | 'failed' | 'review'
  add: number
  del: number
  summary: string
  createdAt: number
}

// ── settings ─────────────────────────────────────────────────────────
export interface AppSettings {
  onboarded: boolean
  theme: 'dark' | 'light'
  /** Display name shown in the sidebar; defaults to the OS username. */
  displayName: string
  provider: string
  model: string
  smart: string
  executor: string
  mode: PermissionMode
  editor: string
  openOnDone: boolean
  soundOnDone: boolean
  doneSound: string
  /** Absolute path to a user-chosen audio file, used when doneSound === 'custom'. */
  customSoundPath: string
  evalLoop: boolean
  /** Where per-agent git worktrees are created. Default: ~/.harnext-desktop/worktrees */
  worktreeRoot: string
}

export interface ProviderOption {
  id: string
  name: string
  sub: string
  defaultModel: string
  models: string[]
  authenticated: boolean
  /** Local inference server (e.g. ollama) — configured by base URL, no API key. */
  local: boolean
  /** Where the user obtains credentials — shown as a "get a key" link in setup. */
  consoleUrl: string
  /** Current base URL for local providers, so setup can pre-fill it. */
  baseUrl: string | null
}

/** Outcome of probing a provider's API with the supplied credentials. */
export interface ProviderVerifyResult {
  ok: boolean
  /** ok = reachable & authorized; auth = bad key; unreachable = network; error = other. */
  status: 'ok' | 'auth' | 'unreachable' | 'error'
  message: string
  /** Live model ids the credentials can reach, when the provider returns them. */
  models: string[]
}

// ── push events ──────────────────────────────────────────────────────
export type AgentPush =
  | { agentId: string; type: 'text'; role: Role; text: string }
  | { agentId: string; type: 'message'; item: MessageItem }
  | { agentId: string; type: 'tool-start'; item: ToolCallItem }
  | {
      agentId: string
      type: 'tool-end'
      toolCallId: string
      result: string | null
      isError: boolean
      endedAt: number
    }
  | { agentId: string; type: 'status'; status: AgentStatus; progress: string; error?: string }
  | { agentId: string; type: 'progress'; progress: string }
  | { agentId: string; type: 'diff'; diff: WorktreeDiff }
  | { agentId: string; type: 'agents-changed'; projectId: number }
  | { agentId: string; type: 'loops-changed'; projectId: number }
  | { agentId: string; type: 'sandbox'; info: SandboxInfo }
  // Steering: messages queued while the agent is mid-run, injected at the next
  // turn boundary. `steers` is the current pending queue (empty = none).
  | { agentId: string; type: 'steers'; steers: string[] }
  // A run ended (aborted/failed) with steers still queued — surface to resend.
  | { agentId: string; type: 'steers-undelivered'; texts: string[] }

export interface StartAgentInput {
  projectId: number
  prompt: string
  /** Attached images (data URLs) to send with the opening prompt. */
  images?: string[]
  /** overrides; defaults come from settings */
  model?: string
  smart?: string
  executor?: string
  permissionMode?: PermissionMode
  provider?: string
  /** Git ref the agent's worktree branches off. Unset = the project's HEAD. */
  baseBranch?: string
}

/** Branches a new agent can be based on (local + remote-tracking), for the picker. */
export interface BranchList {
  /** The project's current branch, used as the default base. */
  current: string | null
  local: string[]
  remote: string[]
}

export interface LoopInput {
  projectId: number
  title: string
  prompt: string
  type: LoopType
  config: LoopConfig
  enabled: boolean
}

// ── filesystem browsing (custom in-app picker) ───────────────────────
export interface FsEntry {
  name: string
  path: string
  isDir: boolean
  isSymlink: boolean
}
export interface FsListing {
  /** The resolved directory that was listed. */
  path: string
  /** Parent directory, or null at the filesystem root. */
  parent: string | null
  entries: FsEntry[]
  /** Set when the directory couldn't be read (permission denied, missing, …). */
  error?: string
}

// ── MCP server connector (backed by @harnext/core's mcp-config) ───────
export type McpScope = 'user' | 'project'
export type McpLifecycle = 'lazy' | 'eager' | 'keep-alive'
export type McpTransport = 'stdio' | 'url'
/** Subset of core's McpServerConfig the connector UI manages. */
export interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  lifecycle?: McpLifecycle
}
export interface McpServerRow {
  name: string
  scope: McpScope
  transport: McpTransport
  enabled: boolean
  config: McpServerConfig
}

// ── renderer API ─────────────────────────────────────────────────────
export interface DesktopApi {
  win: {
    minimize(): void
    maximize(): void
    close(): void
  }
  pickDirectory(): Promise<string | null>
  /** Read-only filesystem browsing for the custom file/folder picker. */
  fs: {
    home(): Promise<string>
    listDir(path: string): Promise<FsListing>
  }
  /** MCP server connector — add / list / remove / toggle custom servers. */
  mcp: {
    list(cwd: string | null): Promise<McpServerRow[]>
    add(scope: McpScope, name: string, server: McpServerConfig, cwd: string | null): Promise<void>
    remove(scope: McpScope, name: string, cwd: string | null): Promise<void>
    setEnabled(scope: McpScope, name: string, enabled: boolean, cwd: string | null): Promise<void>
  }
  /** Open a URL in the user's default browser. */
  openExternal(url: string): Promise<void>
  /** Pick an audio file (returns its absolute path) for the custom "done" sound. */
  pickAudioFile(): Promise<string | null>
  /** Read a local audio file as a data URL so the renderer can play it. */
  readSound(path: string): Promise<string | null>
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  providers: {
    list(): Promise<ProviderOption[]>
    /** Full live model catalog for a provider, falling back to curated defaults. */
    models(provider: string): Promise<string[]>
    saveKey(provider: string, key: string): Promise<void>
    saveBaseUrl(provider: string, baseUrl: string): Promise<void>
    verify(
      provider: string,
      cred: { key?: string; baseUrl?: string }
    ): Promise<ProviderVerifyResult>
    remove(provider: string): Promise<void>
  }
  projects: {
    list(): Promise<Project[]>
    create(path: string): Promise<Project>
    remove(id: number): Promise<void>
    touch(id: number): Promise<void>
    /** Fetch from the remote (best-effort) and list local + remote branches. */
    branches(id: number): Promise<BranchList>
    /** Probe the host for Docker + Compose availability. */
    dockerStatus(): Promise<DockerStatus>
    /** Re-run compose detection for a project, preserving the user's enable choice. */
    detectEnv(id: number): Promise<Project>
    /** Patch a project's env config (e.g. toggle the sandbox on/off). */
    setEnvConfig(id: number, patch: Partial<ProjectEnvConfig>): Promise<Project>
    /** Set user overrides (compose file / workspace / preview service) and re-detect. */
    setEnvOverrides(id: number, patch: EnvOverrides): Promise<Project>
  }
  agents: {
    list(projectId: number): Promise<AgentMeta[]>
    start(input: StartAgentInput): Promise<AgentMeta>
    prompt(agentId: string, text: string, images?: string[]): Promise<void>
    /** Remove and return the last queued steer (for Esc-to-recall editing). */
    recallSteer(agentId: string): Promise<string | null>
    abort(agentId: string): Promise<void>
    remove(agentId: string): Promise<void>
    timeline(agentId: string): Promise<TimelineItem[]>
    diff(agentId: string): Promise<WorktreeDiff>
    merge(agentId: string): Promise<void>
    suggestPR(agentId: string): Promise<{ title: string; base: string; body: string }>
    openPR(agentId: string, opts: { base?: string; title?: string; body?: string }): Promise<string>
    discard(agentId: string): Promise<void>
    openEditor(agentId: string): Promise<void>
    stopAll(): Promise<void>
    /** Current Docker sandbox state for an agent (forwarded ports, status). */
    sandbox(agentId: string): Promise<SandboxInfo>
  }
  loops: {
    list(projectId: number): Promise<LoopMeta[]>
    create(input: LoopInput): Promise<LoopMeta>
    update(id: number, input: LoopInput): Promise<LoopMeta>
    remove(id: number): Promise<void>
    toggle(id: number): Promise<LoopMeta>
    runNow(id: number): Promise<void>
    runs(loopId: number): Promise<LoopRun[]>
  }
  onAgentEvent(cb: (e: AgentPush) => void): () => void
}
