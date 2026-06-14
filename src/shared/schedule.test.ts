import { describe, it, expect } from 'vitest'
import { intervalMinutes, weekdays, buildCadence } from './schedule'

describe('intervalMinutes', () => {
  it('prefers intervalMinutes when set', () => {
    expect(intervalMinutes({ intervalMinutes: 30 })).toBe(30)
    expect(intervalMinutes({ intervalMinutes: 30, intervalHours: 6 })).toBe(30)
  })
  it('falls back to legacy intervalHours', () => {
    expect(intervalMinutes({ intervalHours: 2 })).toBe(120)
  })
  it('defaults to 6 hours when nothing is set', () => {
    expect(intervalMinutes({})).toBe(360)
  })
})

describe('weekdays', () => {
  it('returns sorted days', () => {
    expect(weekdays({ days: [4, 0, 2] })).toEqual([0, 2, 4])
  })
  it('prefers days over legacy single day', () => {
    expect(weekdays({ days: [1, 3], day: 5 })).toEqual([1, 3])
  })
  it('falls back to legacy single day', () => {
    expect(weekdays({ day: 3 })).toEqual([3])
  })
  it('defaults to Monday when nothing is set', () => {
    expect(weekdays({})).toEqual([0])
  })
})

describe('buildCadence', () => {
  it('formats interval cadences', () => {
    expect(buildCadence('interval', { intervalMinutes: 1 })).toBe('Every minute')
    expect(buildCadence('interval', { intervalMinutes: 30 })).toBe('Every 30 minutes')
    expect(buildCadence('interval', { intervalMinutes: 60 })).toBe('Every hour')
    expect(buildCadence('interval', { intervalMinutes: 120 })).toBe('Every 2 hours')
    expect(buildCadence('interval', { intervalMinutes: 90 })).toBe('Every 1h 30m')
    expect(buildCadence('interval', {})).toBe('Every 6 hours')
    expect(buildCadence('interval', { intervalHours: 3 })).toBe('Every 3 hours')
  })
  it('formats daily cadences', () => {
    expect(buildCadence('daily', { time: '14:20' })).toBe('Every day · 14:20')
    expect(buildCadence('daily', {})).toBe('Every day · 09:00')
  })
  it('formats weekly cadences with multiple weekdays', () => {
    expect(buildCadence('weekly', { days: [0, 2, 4], time: '14:20' })).toBe(
      'Weekly · Mon/Wed/Fri 14:20'
    )
    expect(buildCadence('weekly', { day: 6 })).toBe('Weekly · Sun 09:00')
    expect(buildCadence('weekly', {})).toBe('Weekly · Mon 09:00')
  })
})
