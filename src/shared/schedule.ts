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
