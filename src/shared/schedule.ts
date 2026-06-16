import type { LoopConfig, LoopType } from './types'

// 0 = Monday … 6 = Sunday (the app's weekday convention).
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Minutes between runs for an interval loop (honours legacy intervalHours). */
export function intervalMinutes(c: LoopConfig): number {
  if (c.intervalMinutes != null) return c.intervalMinutes
  return (c.intervalHours ?? 6) * 60
}

/** Weekdays a weekly loop fires on (honours legacy single `day`). */
export function weekdays(c: LoopConfig): number[] {
  if (c.days && c.days.length) return [...c.days].sort((a, b) => a - b)
  return c.day != null ? [c.day] : [0]
}

/** Next fire time strictly after `from`. Pure/deterministic given `from`. */
export function computeNextRun(type: LoopType, config: LoopConfig, from: number): number {
  if (type === 'interval') {
    return from + intervalMinutes(config) * 60_000
  }
  const [hh, mm] = (config.time ?? '09:00').split(':').map((n) => parseInt(n, 10))
  const next = new Date(from)
  next.setHours(hh, mm, 0, 0)
  if (type === 'daily') {
    if (next.getTime() <= from) next.setDate(next.getDate() + 1)
    return next.getTime()
  }
  // weekly — config days 0 = Monday … 6 = Sunday; JS getDay(): 0 = Sunday.
  // Advance day-by-day to the soonest future time matching any selected weekday.
  const targetDows = new Set(weekdays(config).map((d) => (d + 1) % 7))
  while (!targetDows.has(next.getDay()) || next.getTime() <= from) {
    next.setDate(next.getDate() + 1)
    next.setHours(hh, mm, 0, 0)
  }
  return next.getTime()
}

function formatInterval(mins: number): string {
  if (mins % 60 === 0) {
    const h = mins / 60
    return h === 1 ? 'Every hour' : `Every ${h} hours`
  }
  if (mins < 60) return mins === 1 ? 'Every minute' : `Every ${mins} minutes`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `Every ${h}h ${m}m`
}

/** Human-readable cadence label shown in the form and on Loop Detail. */
export function buildCadence(type: LoopType, c: LoopConfig): string {
  if (type === 'interval') return formatInterval(intervalMinutes(c))
  const time = c.time ?? '09:00'
  if (type === 'daily') return `Every day · ${time}`
  return `Weekly · ${weekdays(c)
    .map((d) => DAY_SHORT[d])
    .join('/')} ${time}`
}
