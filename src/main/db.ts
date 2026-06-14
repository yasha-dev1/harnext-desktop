import Database from 'better-sqlite3'
import { app } from 'electron'
import { join, basename } from 'node:path'
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
  Role,
  TimelineItem,
  ToolCallItem
} from '../shared/types'

let db: Database.Database

const MIGRATIONS = [
  // v1 — original schema (projects, agents, messages, tool_calls, file_changes)
  `
  CREATE TABLE projects (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    path        TEXT NOT NULL UNIQUE,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE agents (
    id              TEXT PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('running','idle','error','aborted')),
    provider        TEXT,
    model_id        TEXT,
    permission_mode TEXT NOT NULL DEFAULT 'acceptEdits',
    error           TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  );

  CREATE TABLE messages (
    id         INTEGER PRIMARY KEY,
    agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    seq        INTEGER NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content    TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE tool_calls (
    id           INTEGER PRIMARY KEY,
    agent_id     TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    seq          INTEGER NOT NULL,
    tool_call_id TEXT NOT NULL,
    tool_name    TEXT NOT NULL,
    args_json    TEXT NOT NULL,
    result       TEXT,
    is_error     INTEGER NOT NULL DEFAULT 0,
    started_at   INTEGER NOT NULL,
    ended_at     INTEGER
  );

  CREATE TABLE file_changes (
    id             INTEGER PRIMARY KEY,
    agent_id       TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tool_call_id   TEXT NOT NULL,
    path           TEXT NOT NULL,
    before_content TEXT,
    after_content  TEXT,
    diff           TEXT NOT NULL,
    additions      INTEGER NOT NULL DEFAULT 0,
    deletions      INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL
  );

  CREATE INDEX idx_messages_agent ON messages(agent_id, seq);
  CREATE INDEX idx_tool_calls_agent ON tool_calls(agent_id, seq);
  CREATE INDEX idx_file_changes_agent ON file_changes(agent_id, created_at);
  `,
  // v2 — design overhaul: worktrees, goal mode, design statuses, loops, settings
  `
  ALTER TABLE projects ADD COLUMN branch TEXT;
  ALTER TABLE projects ADD COLUMN is_git INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE projects ADD COLUMN last_opened_at INTEGER NOT NULL DEFAULT 0;
  UPDATE projects SET last_opened_at = created_at;

  CREATE TABLE agents_v2 (
    id              TEXT PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('running','review','input','done','failed','paused')),
    mode            TEXT NOT NULL DEFAULT 'single' CHECK (mode IN ('single','goal')),
    model_id        TEXT,
    smart_model     TEXT,
    exec_model      TEXT,
    permission_mode TEXT NOT NULL DEFAULT 'acceptEdits',
    branch          TEXT,
    worktree_path   TEXT,
    progress        TEXT NOT NULL DEFAULT '',
    additions       INTEGER NOT NULL DEFAULT 0,
    deletions       INTEGER NOT NULL DEFAULT 0,
    error           TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  );
  INSERT INTO agents_v2 (id, project_id, title, status, mode, model_id, permission_mode, error, created_at, updated_at)
    SELECT id, project_id, title,
      CASE status WHEN 'running' THEN 'failed' WHEN 'idle' THEN 'input' WHEN 'error' THEN 'failed' ELSE 'paused' END,
      'single', model_id, permission_mode, error, created_at, updated_at
    FROM agents;
  DROP TABLE agents;
  ALTER TABLE agents_v2 RENAME TO agents;

  CREATE TABLE messages_v2 (
    id         INTEGER PRIMARY KEY,
    agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    seq        INTEGER NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('user','plan','exec','eval')),
    content    TEXT NOT NULL,
    verdict    TEXT,
    created_at INTEGER NOT NULL
  );
  INSERT INTO messages_v2 (id, agent_id, seq, role, content, created_at)
    SELECT id, agent_id, seq, CASE role WHEN 'assistant' THEN 'exec' ELSE 'user' END, content, created_at
    FROM messages;
  DROP TABLE messages;
  ALTER TABLE messages_v2 RENAME TO messages;
  CREATE INDEX idx_messages_agent ON messages(agent_id, seq);

  ALTER TABLE tool_calls ADD COLUMN role TEXT NOT NULL DEFAULT 'exec';

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE loops (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    prompt      TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('interval','daily','weekly')),
    config_json TEXT NOT NULL,
    cadence     TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('active','paused')),
    last_run_at INTEGER,
    next_run_at INTEGER,
    runs        INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE loop_runs (
    id         INTEGER PRIMARY KEY,
    loop_id    INTEGER NOT NULL REFERENCES loops(id) ON DELETE CASCADE,
    agent_id   TEXT,
    status     TEXT NOT NULL CHECK (status IN ('done','failed','review')),
    additions  INTEGER NOT NULL DEFAULT 0,
    deletions  INTEGER NOT NULL DEFAULT 0,
    summary    TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_loop_runs_loop ON loop_runs(loop_id, created_at DESC);
  `
]

export function initDb(): void {
  db = new Database(join(app.getPath('userData'), 'harnext.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const version = db.pragma('user_version', { simple: true }) as number
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i])
      db.pragma(`user_version = ${i + 1}`)
    })()
  }

  // Agents left 'running' by a crash/quit can never resume — mark them.
  db.prepare(
    `UPDATE agents SET status = 'failed', error = 'interrupted by app shutdown', updated_at = ? WHERE status = 'running'`
  ).run(Date.now())
}

// ── settings ─────────────────────────────────────────────────────────

const SETTINGS_DEFAULTS: AppSettings = {
  onboarded: false,
  theme: 'dark',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  smart: 'claude-opus-4-8',
  executor: 'claude-sonnet-4-6',
  mode: 'acceptEdits',
  editor: 'VS Code',
  openOnDone: false,
  evalLoop: true
}

export function getSettings(): AppSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  const stored: Record<string, unknown> = {}
  for (const r of rows) {
    try {
      stored[r.key] = JSON.parse(r.value)
    } catch {
      /* skip bad rows */
    }
  }
  return { ...SETTINGS_DEFAULTS, ...stored }
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
}

function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    path: r.path,
    branch: r.branch,
    isGit: r.is_git === 1,
    lastOpenedAt: r.last_opened_at,
    createdAt: r.created_at
  }
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

export function removeProject(id: number): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
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
  verdict: 'approve' | 'revise' | null = null
): MessageItem {
  const createdAt = Date.now()
  db.prepare(
    'INSERT INTO messages (agent_id, seq, role, content, verdict, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(agentId, seq, role, content, verdict, createdAt)
  return { kind: 'message', seq, role, content, verdict, createdAt }
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
