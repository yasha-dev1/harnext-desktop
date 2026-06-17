import Database from 'better-sqlite3'
import { app } from 'electron'
import { copyFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { userInfo } from 'node:os'
import { DEFAULT_WORKTREE_ROOT } from './git'
import { runMigrations } from './migrations'
import { mergeStoredSettings } from './settings-merge'
import { MIGRATIONS } from './migrations-sql'

/** A friendly default identity derived from the machine, not hardcoded. */
function defaultDisplayName(): string {
  try {
    return userInfo().username || 'You'
  } catch {
    return 'You'
  }
}
import type {
  AgentMeta,
  AgentMode,
  AgentStatus,
  AppSettings,
  LoopConfig,
  LoopInput,
  LoopMeta,
  LoopRun,
  LoopType,
  MessageItem,
  PermissionMode,
  Project,
  ProjectEnvConfig,
  Role,
  TimelineItem,
  ToolCallItem
} from '../shared/types'

let db: Database.Database

export function initDb(): void {
  db = new Database(join(app.getPath('userData'), 'harnext.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const version = db.pragma('user_version', { simple: true }) as number
  const dbPath = join(app.getPath('userData'), 'harnext.db')
  runMigrations({
    version,
    count: MIGRATIONS.length,
    apply: (i) =>
      db.transaction(() => {
        db.exec(MIGRATIONS[i])
        db.pragma(`user_version = ${i + 1}`)
      })(),
    // Back up an existing DB once before applying any migration, so a failed
    // post-update migration is recoverable (#162). A fresh DB (v0) has nothing
    // to lose, so skip it.
    backup:
      version > 0
        ? () => {
            try {
              copyFileSync(dbPath, `${dbPath}.bak`)
            } catch {
              /* best-effort — never block startup on the backup */
            }
          }
        : undefined,
    onDowngrade: (dbv, appv) =>
      console.warn(
        `[db] schema v${dbv} is newer than this build (v${appv}); skipping migrations to avoid corruption`
      )
  })

  // A loop run's placeholder ('review' / "Running…") is reconciled to its real
  // outcome by an in-memory onSettled callback that doesn't survive a restart.
  // Reconcile interrupted in-flight runs to 'failed' so they don't show
  // "Review · Running…" forever. Must run BEFORE the agent update below, since
  // it keys on the spawning agent still being 'running'.
  db.prepare(
    `UPDATE loop_runs SET status = 'failed', summary = 'Interrupted by app shutdown'
     WHERE status = 'review' AND agent_id IN (SELECT id FROM agents WHERE status = 'running')`
  ).run()

  // Agents left 'running' by a crash/quit can never resume — mark them.
  db.prepare(
    `UPDATE agents SET status = 'failed', error = 'interrupted by app shutdown', updated_at = ? WHERE status = 'running'`
  ).run(Date.now())
}

// ── settings ─────────────────────────────────────────────────────────

const SETTINGS_DEFAULTS: AppSettings = {
  onboarded: false,
  theme: 'dark',
  displayName: defaultDisplayName(),
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  smart: 'claude-opus-4-8',
  executor: 'claude-sonnet-4-6',
  thinkingLevel: 'medium',
  mode: 'acceptEdits',
  editor: 'VS Code',
  openOnDone: false,
  evalLoop: true,
  worktreeRoot: DEFAULT_WORKTREE_ROOT,
  soundOnDone: true,
  doneSound: 'chime',
  customSoundPath: '',
  contextEngineUrl: 'https://app.harnext.dev/api'
}

export function getSettings(): AppSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  return mergeStoredSettings(rows, SETTINGS_DEFAULTS)
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) stmt.run(k, JSON.stringify(v))
  })
  tx()
  return getSettings()
}

// ── projects ─────────────────────────────────────────────────────────

interface ProjectRow {
  id: number
  name: string
  path: string
  branch: string | null
  is_git: number
  last_opened_at: number
  created_at: number
  env_config: string | null
  active_worktree_path: string | null
  active_branch: string | null
}

function toProject(r: ProjectRow): Project {
  let envConfig: ProjectEnvConfig | null = null
  if (r.env_config) {
    try {
      envConfig = JSON.parse(r.env_config) as ProjectEnvConfig
    } catch {
      /* corrupt row — treat as not-yet-analyzed */
    }
  }
  return {
    id: r.id,
    name: r.name,
    path: r.path,
    branch: r.branch,
    isGit: r.is_git === 1,
    lastOpenedAt: r.last_opened_at,
    createdAt: r.created_at,
    envConfig,
    activeWorktreePath: r.active_worktree_path,
    activeBranch: r.active_branch
  }
}

/** The directory a project's work happens in — its active branch worktree, or
 *  the main checkout when none is pinned. Used as the repo cwd for agents/env. */
export function projectCwd(p: Pick<Project, 'path' | 'activeWorktreePath'>): string {
  return p.activeWorktreePath ?? p.path
}

/** Pin (or clear, with nulls) the worktree a project's context points at. */
export function setActiveWorktree(
  id: number,
  worktreePath: string | null,
  branch: string | null
): Project | undefined {
  db.prepare('UPDATE projects SET active_worktree_path = ?, active_branch = ? WHERE id = ?').run(
    worktreePath,
    branch,
    id
  )
  return getProject(id)
}

export function listProjects(): Project[] {
  return (
    db.prepare('SELECT * FROM projects ORDER BY last_opened_at DESC').all() as ProjectRow[]
  ).map(toProject)
}

export function createProject(path: string, branch: string | null, isGit: boolean): Project {
  const existing = db.prepare('SELECT * FROM projects WHERE path = ?').get(path) as
    | ProjectRow
    | undefined
  if (existing) {
    touchProject(existing.id)
    db.prepare('UPDATE projects SET branch = ?, is_git = ? WHERE id = ?').run(
      branch,
      isGit ? 1 : 0,
      existing.id
    )
    return getProject(existing.id)!
  }
  const now = Date.now()
  const info = db
    .prepare(
      'INSERT INTO projects (name, path, branch, is_git, last_opened_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(basename(path), path, branch, isGit ? 1 : 0, now, now)
  return getProject(Number(info.lastInsertRowid))!
}

export function getProject(id: number): Project | undefined {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
  return row ? toProject(row) : undefined
}

export function touchProject(id: number): void {
  db.prepare('UPDATE projects SET last_opened_at = ? WHERE id = ?').run(Date.now(), id)
}

export function setProjectEnvConfig(id: number, config: ProjectEnvConfig): Project | undefined {
  db.prepare('UPDATE projects SET env_config = ? WHERE id = ?').run(JSON.stringify(config), id)
  return getProject(id)
}

export function removeProject(id: number): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

// ── project secrets (encrypted; see env/secrets.ts) ──────────────────
// Storage only — these store/return ciphertext. Encryption lives in
// env/secrets.ts so the plaintext never reaches the DB layer.

export function upsertSecret(projectId: number, key: string, valueEnc: string): void {
  db.prepare(
    `INSERT INTO project_secrets (project_id, key, value_enc, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(project_id, key) DO UPDATE SET value_enc = excluded.value_enc`
  ).run(projectId, key, valueEnc, Date.now())
}

export function listSecretRows(projectId: number): { key: string; value_enc: string }[] {
  return db
    .prepare('SELECT key, value_enc FROM project_secrets WHERE project_id = ? ORDER BY key')
    .all(projectId) as { key: string; value_enc: string }[]
}

export function deleteSecret(projectId: number, key: string): void {
  db.prepare('DELETE FROM project_secrets WHERE project_id = ? AND key = ?').run(projectId, key)
}

// ── agents ───────────────────────────────────────────────────────────

interface AgentRow {
  id: string
  project_id: number
  title: string
  status: AgentStatus
  mode: AgentMode
  model_id: string | null
  smart_model: string | null
  exec_model: string | null
  permission_mode: PermissionMode
  branch: string | null
  worktree_path: string | null
  progress: string
  additions: number
  deletions: number
  error: string | null
  created_at: number
  updated_at: number
}

function toAgentMeta(r: AgentRow, live: boolean): AgentMeta {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    status: r.status,
    mode: r.mode,
    modelId: r.model_id,
    smartModel: r.smart_model,
    execModel: r.exec_model,
    permissionMode: r.permission_mode,
    branch: r.branch,
    worktreePath: r.worktree_path,
    progress: r.progress,
    error: r.error,
    live,
    add: r.additions,
    del: r.deletions,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function listAgents(projectId: number, isLive: (id: string) => boolean): AgentMeta[] {
  const rows = db
    .prepare('SELECT * FROM agents WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId) as AgentRow[]
  return rows.map((r) => toAgentMeta(r, isLive(r.id)))
}

export function getAgent(id: string, live: boolean): AgentMeta | undefined {
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as AgentRow | undefined
  return row ? toAgentMeta(row, live) : undefined
}

export function insertAgent(input: {
  id: string
  projectId: number
  title: string
  mode: AgentMode
  modelId: string | null
  smartModel: string | null
  execModel: string | null
  permissionMode: PermissionMode
  branch: string | null
  worktreePath: string | null
  progress: string
}): void {
  const now = Date.now()
  db.prepare(
    `INSERT INTO agents (id, project_id, title, status, mode, model_id, smart_model, exec_model,
       permission_mode, branch, worktree_path, progress, created_at, updated_at)
     VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.projectId,
    input.title,
    input.mode,
    input.modelId,
    input.smartModel,
    input.execModel,
    input.permissionMode,
    input.branch,
    input.worktreePath,
    input.progress,
    now,
    now
  )
}

export function updateAgentStatus(
  id: string,
  status: AgentStatus,
  progress: string,
  error?: string
): void {
  db.prepare(
    'UPDATE agents SET status = ?, progress = ?, error = ?, updated_at = ? WHERE id = ?'
  ).run(status, progress, error ?? null, Date.now(), id)
}

export function updateAgentProgress(id: string, progress: string): void {
  db.prepare('UPDATE agents SET progress = ? WHERE id = ?').run(progress, id)
}

export function updateAgentDiffStat(id: string, add: number, del: number): void {
  db.prepare('UPDATE agents SET additions = ?, deletions = ? WHERE id = ?').run(add, del, id)
}

/** Rename a conversation (#115). Trims; ignores an empty title. */
export function renameAgent(id: string, title: string): void {
  const t = title.trim()
  if (!t) return
  db.prepare('UPDATE agents SET title = ?, updated_at = ? WHERE id = ?').run(t, Date.now(), id)
}

export function removeAgent(id: string): void {
  db.prepare('DELETE FROM agents WHERE id = ?').run(id)
}

export function listRunningAgents(): AgentMeta[] {
  const rows = db.prepare(`SELECT * FROM agents WHERE status = 'running'`).all() as AgentRow[]
  return rows.map((r) => toAgentMeta(r, true))
}

// ── timeline ─────────────────────────────────────────────────────────

export function insertMessage(
  agentId: string,
  seq: number,
  role: Role,
  content: string,
  verdict: 'approve' | 'revise' | null = null,
  images?: string[]
): MessageItem {
  const createdAt = Date.now()
  const imagesJson = images && images.length ? JSON.stringify(images) : null
  db.prepare(
    'INSERT INTO messages (agent_id, seq, role, content, verdict, images, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(agentId, seq, role, content, verdict, imagesJson, createdAt)
  return {
    kind: 'message',
    seq,
    role,
    content,
    verdict,
    ...(imagesJson ? { images: images as string[] } : {}),
    createdAt
  }
}

export function insertToolCall(
  agentId: string,
  seq: number,
  role: Role,
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>
): ToolCallItem {
  const startedAt = Date.now()
  db.prepare(
    `INSERT INTO tool_calls (agent_id, seq, role, tool_call_id, tool_name, args_json, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(agentId, seq, role, toolCallId, toolName, JSON.stringify(args), startedAt)
  return {
    kind: 'tool',
    seq,
    role,
    toolCallId,
    toolName,
    args,
    result: null,
    isError: false,
    startedAt,
    endedAt: null
  }
}

export function finishToolCall(
  agentId: string,
  toolCallId: string,
  result: string | null,
  isError: boolean
): number {
  const endedAt = Date.now()
  db.prepare(
    'UPDATE tool_calls SET result = ?, is_error = ?, ended_at = ? WHERE agent_id = ? AND tool_call_id = ?'
  ).run(result, isError ? 1 : 0, endedAt, agentId, toolCallId)
  return endedAt
}

interface MessageRow {
  seq: number
  role: Role
  content: string
  verdict: 'approve' | 'revise' | null
  images: string | null
  created_at: number
}

interface ToolCallRow {
  seq: number
  role: Role
  tool_call_id: string
  tool_name: string
  args_json: string
  result: string | null
  is_error: number
  started_at: number
  ended_at: number | null
}

export function getTimeline(agentId: string): TimelineItem[] {
  const messages: TimelineItem[] = (
    db
      .prepare('SELECT * FROM messages WHERE agent_id = ? ORDER BY seq')
      .all(agentId) as MessageRow[]
  ).map((r) => ({
    kind: 'message' as const,
    seq: r.seq,
    role: r.role,
    content: r.content,
    verdict: r.verdict,
    ...(r.images ? { images: JSON.parse(r.images) as string[] } : {}),
    createdAt: r.created_at
  }))
  const tools: TimelineItem[] = (
    db
      .prepare('SELECT * FROM tool_calls WHERE agent_id = ? ORDER BY seq')
      .all(agentId) as ToolCallRow[]
  ).map((r) => ({
    kind: 'tool' as const,
    seq: r.seq,
    role: r.role,
    toolCallId: r.tool_call_id,
    toolName: r.tool_name,
    args: safeParse(r.args_json),
    result: r.result,
    isError: r.is_error === 1,
    startedAt: r.started_at,
    endedAt: r.ended_at
  }))
  return [...messages, ...tools].sort((a, b) => a.seq - b.seq)
}

function safeParse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json)
  } catch {
    return {}
  }
}

// ── snapshot file changes (fallback diff for non-git projects) ──────

export function insertFileChange(input: {
  agentId: string
  toolCallId: string
  path: string
  beforeContent: string | null
  afterContent: string | null
  diff: string
  additions: number
  deletions: number
}): void {
  db.prepare(
    `INSERT INTO file_changes (agent_id, tool_call_id, path, before_content, after_content, diff, additions, deletions, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.agentId,
    input.toolCallId,
    input.path,
    input.beforeContent,
    input.afterContent,
    input.diff,
    input.additions,
    input.deletions,
    Date.now()
  )
}

export interface FileChangeRow {
  path: string
  diff: string
  additions: number
  deletions: number
  before_content: string | null
}

export function listFileChanges(agentId: string): FileChangeRow[] {
  return db
    .prepare(
      'SELECT path, diff, additions, deletions, before_content FROM file_changes WHERE agent_id = ? ORDER BY created_at'
    )
    .all(agentId) as FileChangeRow[]
}

// ── loops ────────────────────────────────────────────────────────────

interface LoopRow {
  id: number
  project_id: number
  title: string
  prompt: string
  type: LoopType
  config_json: string
  cadence: string
  status: 'active' | 'paused'
  last_run_at: number | null
  next_run_at: number | null
  runs: number
  created_at: number
}

function toLoop(r: LoopRow): LoopMeta {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    prompt: r.prompt,
    type: r.type,
    config: safeParse(r.config_json) as LoopConfig,
    cadence: r.cadence,
    status: r.status,
    lastRunAt: r.last_run_at,
    nextRunAt: r.next_run_at,
    runs: r.runs,
    createdAt: r.created_at
  }
}

export function listLoops(projectId: number): LoopMeta[] {
  return (
    db
      .prepare('SELECT * FROM loops WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId) as LoopRow[]
  ).map(toLoop)
}

export function getLoop(id: number): LoopMeta | undefined {
  const row = db.prepare('SELECT * FROM loops WHERE id = ?').get(id) as LoopRow | undefined
  return row ? toLoop(row) : undefined
}

export function insertLoop(input: LoopInput, cadence: string, nextRunAt: number | null): LoopMeta {
  const info = db
    .prepare(
      `INSERT INTO loops (project_id, title, prompt, type, config_json, cadence, status, next_run_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.projectId,
      input.title,
      input.prompt,
      input.type,
      JSON.stringify(input.config),
      cadence,
      input.enabled ? 'active' : 'paused',
      input.enabled ? nextRunAt : null,
      Date.now()
    )
  return getLoop(Number(info.lastInsertRowid))!
}

export function updateLoop(
  id: number,
  input: LoopInput,
  cadence: string,
  nextRunAt: number | null
): LoopMeta {
  db.prepare(
    `UPDATE loops SET title = ?, prompt = ?, type = ?, config_json = ?, cadence = ?, status = ?, next_run_at = ?
     WHERE id = ?`
  ).run(
    input.title,
    input.prompt,
    input.type,
    JSON.stringify(input.config),
    cadence,
    input.enabled ? 'active' : 'paused',
    input.enabled ? nextRunAt : null,
    id
  )
  return getLoop(id)!
}

export function setLoopStatus(
  id: number,
  status: 'active' | 'paused',
  nextRunAt: number | null
): void {
  db.prepare('UPDATE loops SET status = ?, next_run_at = ? WHERE id = ?').run(status, nextRunAt, id)
}

export function markLoopFired(id: number, nextRunAt: number | null): void {
  db.prepare('UPDATE loops SET last_run_at = ?, next_run_at = ?, runs = runs + 1 WHERE id = ?').run(
    Date.now(),
    nextRunAt,
    id
  )
}

/**
 * Record that a loop ran without touching its schedule. Used by manual
 * "Run now" triggers: unlike markLoopFired, this leaves next_run_at intact so a
 * one-off manual run does not skip/delay the next automatic run.
 */
export function markLoopRan(id: number): void {
  db.prepare('UPDATE loops SET last_run_at = ?, runs = runs + 1 WHERE id = ?').run(Date.now(), id)
}

export function removeLoop(id: number): void {
  db.prepare('DELETE FROM loops WHERE id = ?').run(id)
}

export function listDueLoops(now: number): LoopMeta[] {
  return (
    db
      .prepare(
        `SELECT * FROM loops WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= ?`
      )
      .all(now) as LoopRow[]
  ).map(toLoop)
}

export function insertLoopRun(input: {
  loopId: number
  agentId: string | null
  status: 'done' | 'failed' | 'review'
  add: number
  del: number
  summary: string
}): void {
  db.prepare(
    `INSERT INTO loop_runs (loop_id, agent_id, status, additions, deletions, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(input.loopId, input.agentId, input.status, input.add, input.del, input.summary, Date.now())
}

export function updateLoopRunForAgent(
  agentId: string,
  status: 'done' | 'failed' | 'review',
  add: number,
  del: number,
  summary: string
): void {
  db.prepare(
    'UPDATE loop_runs SET status = ?, additions = ?, deletions = ?, summary = ? WHERE agent_id = ?'
  ).run(status, add, del, summary, agentId)
}

interface LoopRunRow {
  id: number
  loop_id: number
  agent_id: string | null
  status: 'done' | 'failed' | 'review'
  additions: number
  deletions: number
  summary: string
  created_at: number
}

export function listLoopRuns(loopId: number): LoopRun[] {
  return (
    db
      .prepare('SELECT * FROM loop_runs WHERE loop_id = ? ORDER BY created_at DESC LIMIT 30')
      .all(loopId) as LoopRunRow[]
  ).map((r) => ({
    id: r.id,
    loopId: r.loop_id,
    agentId: r.agent_id,
    status: r.status,
    add: r.additions,
    del: r.deletions,
    summary: r.summary,
    createdAt: r.created_at
  }))
}

export function getLoopIdForAgent(agentId: string): number | null {
  const row = db.prepare('SELECT loop_id FROM loop_runs WHERE agent_id = ?').get(agentId) as
    | { loop_id: number }
    | undefined
  return row?.loop_id ?? null
}
