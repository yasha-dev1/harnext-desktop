import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  projectColor,
  projectMark,
  shortModel,
  timeAgo,
  timeUntil,
  elapsed,
  STATUS,
  DOT_COLOR
} from './ui'

describe('projectColor', () => {
  it('is deterministic for the same name', () => {
    expect(projectColor({ name: 'harnext' })).toBe(projectColor({ name: 'harnext' }))
  })
  it('returns a palette hex colour', () => {
    expect(projectColor({ name: 'whatever' })).toMatch(/^#[0-9A-F]{6}$/i)
  })
})

describe('projectMark', () => {
  it('uses the first letters of the first two parts', () => {
    expect(projectMark({ name: 'harnext-desktop' })).toBe('HD')
    expect(projectMark({ name: 'my_app project' })).toBe('MA')
  })
  it('uses the first two letters for a single-word name', () => {
    expect(projectMark({ name: 'harnext' })).toBe('HA')
  })
})

describe('shortModel', () => {
  it('keeps only the segment after the last slash', () => {
    expect(shortModel('anthropic/claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
    expect(shortModel('gpt-4o')).toBe('gpt-4o')
  })
  it('returns empty string for null', () => {
    expect(shortModel(null)).toBe('')
  })
})

describe('time helpers', () => {
  const NOW = new Date('2026-06-14T12:00:00Z').getTime()
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('timeAgo', () => {
    expect(timeAgo(null)).toBe('never')
    expect(timeAgo(NOW - 30_000)).toBe('just now')
    expect(timeAgo(NOW - 90_000)).toBe('1m ago')
    expect(timeAgo(NOW - 2 * 3600_000)).toBe('2h ago')
    expect(timeAgo(NOW - 25 * 3600_000)).toBe('yesterday')
    expect(timeAgo(NOW - 50 * 3600_000)).toBe('2 days ago')
  })

  it('timeUntil', () => {
    expect(timeUntil(null)).toBe('—')
    expect(timeUntil(NOW + 30_000)).toBe('in <1m')
    expect(timeUntil(NOW + 5 * 60_000)).toBe('in 5m')
    expect(timeUntil(NOW + 2 * 3600_000)).toBe('in 2h')
    expect(timeUntil(NOW + 2 * 24 * 3600_000)).toBe('in 2d')
    expect(timeUntil(NOW - 60_000)).toBe('in <1m') // past clamps to 0
  })
})

describe('elapsed', () => {
  it('formats m s and h mm', () => {
    expect(elapsed(0, 90_000)).toBe('1m 30s')
    expect(elapsed(0, 3_661_000)).toBe('1h 01m')
  })
})

describe('status maps', () => {
  it('cover every agent status', () => {
    const statuses = ['running', 'review', 'input', 'done', 'failed', 'paused'] as const
    for (const s of statuses) {
      expect(STATUS[s].label).toBeTruthy()
      expect(DOT_COLOR[s]).toBeTruthy()
    }
  })
})
