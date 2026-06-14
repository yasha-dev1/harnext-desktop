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
  /** hours, for interval loops */
  intervalHours?: number
  /** "HH:MM", for daily/weekly loops */
  time?: string
  /** 0 = Monday … 6 = Sunday, for weekly loops */
  day?: number
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
  provider: string
  model: string
  smart: string
  executor: string
  mode: PermissionMode
  editor: string
  openOnDone: boolean
  evalLoop: boolean
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

export interface StartAgentInput {
  projectId: number
  prompt: string
  /** overrides; defaults come from settings */
  model?: string
  smart?: string
  executor?: string
  permissionMode?: PermissionMode
}

export interface LoopInput {
  projectId: number
  title: string
  prompt: string
  type: LoopType
  config: LoopConfig
  enabled: boolean
}

// ── renderer API ─────────────────────────────────────────────────────
export interface DesktopApi {
  win: {
    minimize(): void
    maximize(): void
    close(): void
  }
  pickDirectory(): Promise<string | null>
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
  }
  agents: {
    list(projectId: number): Promise<AgentMeta[]>
    start(input: StartAgentInput): Promise<AgentMeta>
    prompt(agentId: string, text: string): Promise<void>
    abort(agentId: string): Promise<void>
    remove(agentId: string): Promise<void>
    timeline(agentId: string): Promise<TimelineItem[]>
    diff(agentId: string): Promise<WorktreeDiff>
    merge(agentId: string): Promise<void>
    discard(agentId: string): Promise<void>
    openEditor(agentId: string): Promise<void>
    stopAll(): Promise<void>
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
