import { describe, it, expect } from 'vitest'
import type { LoopConfig } from '@shared/types'
import { initialInterval, intervalToMinutes, DEFAULT_INTERVAL_MIN } from './loop-interval'

const cfg = (c: Partial<LoopConfig>): LoopConfig => c as LoopConfig

describe('initialInterval', () => {
  it('defaults to 6 hours when nothing is configured', () => {
    expect(initialInterval(undefined)).toEqual({ amt: 6, unit: 'hours' })
    expect(DEFAULT_INTERVAL_MIN).toBe(360)
  })

  it('keeps sub-hour intervals in minutes', () => {
    expect(initialInterval(cfg({ intervalMinutes: 30 }))).toEqual({ amt: 30, unit: 'minutes' })
    expect(initialInterval(cfg({ intervalMinutes: 90 }))).toEqual({ amt: 90, unit: 'minutes' })
  })

  it('prefers whole hours when the minutes divide evenly', () => {
    expect(initialInterval(cfg({ intervalMinutes: 120 }))).toEqual({ amt: 2, unit: 'hours' })
  })

  it('migrates the legacy intervalHours field', () => {
    expect(initialInterval(cfg({ intervalHours: 3 }))).toEqual({ amt: 3, unit: 'hours' })
  })

  it('prefers intervalMinutes over the legacy intervalHours when both are present', () => {
    expect(initialInterval(cfg({ intervalMinutes: 45, intervalHours: 2 }))).toEqual({
      amt: 45,
      unit: 'minutes'
    })
  })
})

describe('intervalToMinutes', () => {
  it('passes minutes through', () => {
    expect(intervalToMinutes(90, 'minutes')).toBe(90)
  })

  it('converts hours to minutes', () => {
    expect(intervalToMinutes(2, 'hours')).toBe(120)
  })

  it('clamps to a minimum of 1 minute', () => {
    expect(intervalToMinutes(0, 'minutes')).toBe(1)
    expect(intervalToMinutes(-5, 'hours')).toBe(1)
  })
})

describe('round-trip', () => {
  it('initialInterval → intervalToMinutes recovers the original minutes', () => {
    for (const mins of [30, 45, 60, 90, 120, 360]) {
      const { amt, unit } = initialInterval({ intervalMinutes: mins } as LoopConfig)
      expect(intervalToMinutes(amt, unit)).toBe(mins)
    }
  })
})
