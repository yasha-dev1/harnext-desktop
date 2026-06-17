import { describe, it, expect } from 'vitest'
import { MIGRATIONS } from './migrations-sql'

/**
 * #176: the migration sequence — the highest-risk untested code, since a bad
 * migration corrupts real user data — was unreachable by tests because db.ts
 * loads the Electron-ABI `better-sqlite3` native addon, which won't load under
 * Vitest's Node env.
 *
 * `node:sqlite` is a real SQLite engine bundled with Node (22.5+) that loads
 * fine here, so we apply the *actual* MIGRATIONS against it. Guarded so a Node
 * build without `node:sqlite` skips rather than fails.
 */
let DatabaseSync: (new (path: string) => SqliteDb) | undefined
try {
  ;({ DatabaseSync } = (await import('node:sqlite')) as unknown as {
    DatabaseSync: new (path: string) => SqliteDb
  })
} catch {
  /* node:sqlite unavailable — tests below skip */
}

interface SqliteDb {
  exec(sql: string): void
  prepare(sql: string): { get(): Record<string, unknown>; all(): Record<string, unknown>[] }
}

// Apply every migration in order, mirroring db.ts's user_version loop.
function migrateAll(): SqliteDb {
  const db = new DatabaseSync!(':memory:')
  for (let i = 0; i < MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i])
    db.exec(`PRAGMA user_version = ${i + 1}`)
  }
  return db
}

const userVersion = (db: SqliteDb): number =>
  Number(db.prepare('PRAGMA user_version').get().user_version)
const tablesOf = (db: SqliteDb): string[] =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => String(r.name))
const colsOf = (db: SqliteDb, t: string): string[] =>
  db
    .prepare(`PRAGMA table_info(${t})`)
    .all()
    .map((r) => String(r.name))

describe.skipIf(!DatabaseSync)('migration SQL applies cleanly (#176)', () => {
  it('builds the full schema and lands on the final user_version', () => {
    const db = migrateAll()
    expect(userVersion(db)).toBe(MIGRATIONS.length)
    const tables = tablesOf(db)
    for (const t of [
      'projects',
      'agents',
      'messages',
      'tool_calls',
      'file_changes',
      'settings',
      'loops',
      'loop_runs',
      'project_secrets'
    ]) {
      expect(tables).toContain(t)
    }
  })

  it('applies the v2 rebuild — agents has the goal-mode + worktree columns', () => {
    const cols = colsOf(migrateAll(), 'agents')
    for (const c of ['mode', 'smart_model', 'exec_model', 'worktree_path', 'branch', 'progress']) {
      expect(cols).toContain(c)
    }
  })

  it('applies the later ALTERs — projects/messages gain their newer columns', () => {
    const db = migrateAll()
    const proj = colsOf(db, 'projects')
    for (const c of ['branch', 'is_git', 'env_config', 'active_worktree_path', 'active_branch']) {
      expect(proj).toContain(c)
    }
    expect(colsOf(db, 'messages')).toContain('images')
  })

  it('is idempotent — nothing is left to apply after a full run', () => {
    expect(MIGRATIONS.length - userVersion(migrateAll())).toBe(0)
  })

  it('preserves data through the v1→v2 agents rebuild (the scary case)', () => {
    const db = new DatabaseSync!(':memory:')
    db.exec(MIGRATIONS[0])
    db.exec('PRAGMA user_version = 1')
    db.exec(`INSERT INTO projects (id, name, path, created_at) VALUES (1, 'p', '/p', 0)`)
    db.exec(
      `INSERT INTO agents (id, project_id, title, status, permission_mode, created_at, updated_at)
       VALUES ('a1', 1, 'legacy agent', 'running', 'acceptEdits', 0, 0)`
    )
    // v2 rebuilds the agents table and maps old statuses.
    db.exec(MIGRATIONS[1])
    db.exec('PRAGMA user_version = 2')

    const row = db.prepare("SELECT id, title, status, mode FROM agents WHERE id = 'a1'").get()
    expect(row.title).toBe('legacy agent') // data survived the rebuild
    expect(row.mode).toBe('single') // backfilled default
    expect(row.status).toBe('failed') // old 'running' → 'failed' per the CASE map
  })
})
