import type { AppSettings } from '../shared/types'

/**
 * Merge the persisted `settings` key/value rows over the defaults.
 *
 * Each row's `value` is a JSON-encoded scalar; an unparseable row is skipped so
 * one corrupt entry can't wipe the whole settings load. The removed `'bruh'`
 * doneSound (its bundled mp3 was dropped) is migrated to the default so upgraded
 * users aren't left with a silent, unrecognised cue.
 *
 * Pure + dependency-free (defaults are injected) so the load/merge rules are
 * unit-testable without the native `better-sqlite3` handle — db.ts calls this
 * with the real rows + SETTINGS_DEFAULTS (#176/#138).
 */
export function mergeStoredSettings(
  rows: { key: string; value: string }[],
  defaults: AppSettings
): AppSettings {
  const stored: Record<string, unknown> = {}
  for (const r of rows) {
    try {
      stored[r.key] = JSON.parse(r.value)
    } catch {
      /* skip bad rows */
    }
  }
  const merged = { ...defaults, ...stored } as AppSettings
  if (merged.doneSound === 'bruh') merged.doneSound = defaults.doneSound
  return merged
}
