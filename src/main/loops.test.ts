import { describe, it, expect } from 'vitest'
import { computeNextRun } from './loops'
import type { LoopConfig } from '../shared/types'

// Regression guards for computeNextRun (QA-020, fixed in #43) — previously
// untested. Pure given `from`, so no clock mocking. All dates are built with the
// local Date constructor and asserted via local getters, matching the function's
// own local-time math, so the tests are timezone-independent.
//
// Anchor: 2024-01-01 is a MONDAY in every timezone (local midnight Jan 1 2024).
const at = (y: number, mo: number, d: number, hh: number, mm: number): number =>
  new Date(y, mo, d, hh, mm, 0, 0).getTime()
const local = (ts: number): Date => new Date(ts)

describe('computeNextRun — interval', () => {
  it('adds the configured interval in minutes', () => {
    const from = at(2024, 0, 1, 12, 0)
    const cfg: LoopConfig = { intervalMinutes: 15 }
    expect(computeNextRun('interval', cfg, from)).toBe(from + 15 * 60_000)
  })

  it('honours an hours-based interval', () => {
    const from = at(2024, 0, 1, 12, 0)
    const cfg: LoopConfig = { intervalMinutes: 120 }
    expect(computeNextRun('interval', cfg, from)).toBe(from + 120 * 60_000)
  })
})

describe('computeNextRun — daily', () => {
  it('fires later the same day when the time is still ahead', () => {
    const from = at(2024, 0, 1, 8, 0) // 08:00
    const next = local(computeNextRun('daily', { time: '09:00' }, from))
    expect(next.getDate()).toBe(1) // same day
    expect(next.getHours()).toBe(9)
    expect(next.getMinutes()).toBe(0)
  })

  it('rolls to tomorrow when today’s time already passed', () => {
    const from = at(2024, 0, 1, 10, 0) // 10:00, past 09:00
    const next = local(computeNextRun('daily', { time: '09:00' }, from))
    expect(next.getDate()).toBe(2) // next day
    expect(next.getHours()).toBe(9)
  })

  it('is strictly after `from` even when the time equals exactly now', () => {
    const from = at(2024, 0, 1, 9, 0) // exactly 09:00
    const ts = computeNextRun('daily', { time: '09:00' }, from)
    expect(ts).toBeGreaterThan(from)
    expect(local(ts).getDate()).toBe(2)
  })
})

describe('computeNextRun — weekly (weekday-wrap boundary)', () => {
  // config days: 0 = Monday … 6 = Sunday.
  it('a Monday-only loop computed on a Tuesday lands on the next Monday', () => {
    // 2024-01-02 is a Tuesday.
    const tuesday = at(2024, 0, 2, 12, 0)
    const next = local(computeNextRun('weekly', { time: '09:00', days: [0] }, tuesday))
    expect(next.getDay()).toBe(1) // JS Monday
    expect(next.getDate()).toBe(8) // the following Monday
    expect(next.getHours()).toBe(9)
  })

  it('a Monday-only loop with the time already passed today rolls a full week', () => {
    // 2024-01-01 is a Monday; 10:00 is past the 09:00 fire time.
    const mondayLate = at(2024, 0, 1, 10, 0)
    const next = local(computeNextRun('weekly', { time: '09:00', days: [0] }, mondayLate))
    expect(next.getDay()).toBe(1)
    expect(next.getDate()).toBe(8) // a week later, NOT today
  })

  it('a same-day loop whose time is still ahead fires today', () => {
    const mondayEarly = at(2024, 0, 1, 8, 0) // Monday 08:00, before 09:00
    const next = local(computeNextRun('weekly', { time: '09:00', days: [0] }, mondayEarly))
    expect(next.getDay()).toBe(1)
    expect(next.getDate()).toBe(1) // today
  })

  it('maps Sunday (config 6) to JS getDay() 0', () => {
    // From Monday 2024-01-01, the next Sunday is 2024-01-07.
    const from = at(2024, 0, 1, 12, 0)
    const next = local(computeNextRun('weekly', { time: '09:00', days: [6] }, from))
    expect(next.getDay()).toBe(0) // JS Sunday
    expect(next.getDate()).toBe(7)
  })

  it('picks the soonest of multiple selected weekdays', () => {
    // Mon(0) + Thu(3) selected, computed Tuesday 2024-01-02 → next is Thursday 2024-01-04.
    const tuesday = at(2024, 0, 2, 12, 0)
    const next = local(computeNextRun('weekly', { time: '09:00', days: [0, 3] }, tuesday))
    expect(next.getDay()).toBe(4) // JS Thursday
    expect(next.getDate()).toBe(4)
  })
})
