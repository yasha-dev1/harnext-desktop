/**
 * SQLite migrations, in order. Index i is `user_version` i+1 once applied.
 *
 * Extracted from db.ts so the migration SQL can be unit-tested against a real
 * SQLite engine WITHOUT importing better-sqlite3 (the Electron-ABI native addon
 * that won't load under Vitest's Node env) — see migrations-sql.test.ts (#176).
 * These are plain DDL strings; db.ts applies them via runMigrations().
 */
export const MIGRATIONS = [
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
  `,
  // v3 — per-project Docker sandbox config (detected on add; JSON, see ProjectEnvConfig)
  `
  ALTER TABLE projects ADD COLUMN env_config TEXT;
  `,
  // v4 — image attachments on a user message (JSON array of data URLs)
  `
  ALTER TABLE messages ADD COLUMN images TEXT;
  `,
  // v5 — branch switcher (#96): the worktree a project's context is pointed at.
  // Null = the main checkout. Agents and the env then run in this worktree.
  `
  ALTER TABLE projects ADD COLUMN active_worktree_path TEXT;
  ALTER TABLE projects ADD COLUMN active_branch TEXT;
  `,
  // v6 — per-project encrypted secret store (#123). Values are safeStorage
  // ciphertext (base64); the column never holds a plaintext secret.
  `
  CREATE TABLE project_secrets (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key        TEXT NOT NULL,
    value_enc  TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (project_id, key)
  );
  `
]
