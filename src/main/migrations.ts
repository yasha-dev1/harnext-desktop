// Safe forward-only schema migration runner (#162 req 4). The startup loop in
// db.ts used to `exec` each migration with no error handling, downgrade guard,
// or backup — so a failed migration on a freshly-updated binary could crash or
// corrupt silently. This pure runner (the DB ops are injected) adds those
// safeguards and is unit-testable without better-sqlite3.

export interface MigrationRunner {
  /** Current schema version (PRAGMA user_version). */
  version: number
  /** Number of migrations this build ships. */
  count: number
  /** Apply migration #index — run its SQL and bump user_version, transactionally. */
  apply: (index: number) => void
  /** One-time DB backup, called once before the first migration is applied. */
  backup?: () => void
  /** Called (instead of migrating) when the DB is newer than this build. */
  onDowngrade?: (dbVersion: number, appVersion: number) => void
}

/**
 * Run pending migrations forward-only and return the resulting schema version.
 *
 * - **Downgrade guard:** if the DB schema is newer than this build knows about,
 *   don't migrate — warn via `onDowngrade` and leave it as-is (warn, not corrupt).
 * - **Backup:** `backup()` runs once before any migration is applied.
 * - **Per-migration safety:** a failing migration throws a clear, indexed error
 *   (after the backup) instead of continuing silently.
 */
export function runMigrations(r: MigrationRunner): number {
  if (r.version > r.count) {
    r.onDowngrade?.(r.version, r.count)
    return r.version
  }
  if (r.version >= r.count) return r.version // already up to date

  r.backup?.()
  let applied = r.version
  for (let i = r.version; i < r.count; i++) {
    try {
      r.apply(i)
      applied = i + 1
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Database migration ${i + 1}/${r.count} failed: ${msg}`)
    }
  }
  return applied
}
