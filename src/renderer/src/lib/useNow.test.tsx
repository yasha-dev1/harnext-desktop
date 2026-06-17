// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNow } from './useNow'

const NOW = new Date('2026-06-14T12:00:00Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('useNow (#138)', () => {
  it('returns the current timestamp', () => {
    const { result } = renderHook(() => useNow())
    expect(result.current).toBe(NOW)
  })

  it('re-evaluates on its interval (so relative times do not freeze)', () => {
    const { result } = renderHook(() => useNow(1000))
    expect(result.current).toBe(NOW)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(NOW + 1000)
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current).toBe(NOW + 4000)
  })

  it('defaults to a 30s cadence — no tick before 30s, one at 30s', () => {
    const { result } = renderHook(() => useNow())
    act(() => vi.advanceTimersByTime(29_000))
    expect(result.current).toBe(NOW) // not yet
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(NOW + 30_000)
  })

  it('clears its interval on unmount (no leaked timers)', () => {
    const clear = vi.spyOn(globalThis, 'clearInterval')
    const { unmount } = renderHook(() => useNow(1000))
    unmount()
    expect(clear).toHaveBeenCalled()
    // After unmount, advancing time must not throw or schedule more work.
    expect(vi.getTimerCount()).toBe(0)
    clear.mockRestore()
  })
})
