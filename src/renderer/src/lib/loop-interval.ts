import type { LoopConfig } from '@shared/types'

/** Default interval for a loop with none configured: 6 hours. */
export const DEFAULT_INTERVAL_MIN = 360

/**
 * The interval picker's amount + unit, derived from a stored loop config
 * (extracted from NewLoopForm so the migration math is unit-testable). Honours
 * the legacy `intervalHours` field (pre-`intervalMinutes`), defaults to 6 hours
 * when neither is set, and prefers whole hours when the minutes divide evenly.
 */
export function initialInterval(c: LoopConfig | undefined): {
  amt: number
  unit: 'minutes' | 'hours'
} {
  const mins =
    c?.intervalMinutes ?? (c?.intervalHours != null ? c.intervalHours * 60 : DEFAULT_INTERVAL_MIN)
  return mins % 60 === 0 ? { amt: mins / 60, unit: 'hours' } : { amt: mins, unit: 'minutes' }
}

/** Fold the picker's amount + unit back into minutes (the stored source of truth), min 1. */
export function intervalToMinutes(amt: number, unit: 'minutes' | 'hours'): number {
  return Math.max(1, unit === 'hours' ? amt * 60 : amt)
}
