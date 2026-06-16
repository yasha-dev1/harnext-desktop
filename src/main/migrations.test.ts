import { describe, it, expect, vi } from 'vitest'
import { runMigrations } from './migrations'

describe('runMigrations — safe forward-only migrations (#162)', () => {
  it('applies every pending migration in order and returns the new version', () => {
    const applied: number[] = []
    const v = runMigrations({ version: 1, count: 4, apply: (i) => applied.push(i) })
    expect(applied).toEqual([1, 2, 3]) // migrations 2,3,4 (0-based indices 1,2,3)
    expect(v).toBe(4)
  })

  it('is a no-op when already up to date', () => {
    const apply = vi.fn()
    expect(runMigrations({ version: 4, count: 4, apply })).toBe(4)
    expect(apply).not.toHaveBeenCalled()
  })

  it('backs up once, before any migration is applied', () => {
    const order: string[] = []
    runMigrations({
      version: 0,
      count: 2,
      apply: (i) => order.push(`apply${i}`),
      backup: () => order.push('backup')
    })
    expect(order).toEqual(['backup', 'apply0', 'apply1'])
  })

  it('does not back up when there is nothing to migrate', () => {
    const backup = vi.fn()
    runMigrations({ version: 2, count: 2, apply: vi.fn(), backup })
    expect(backup).not.toHaveBeenCalled()
  })

  it('throws a clear, indexed error if a migration fails (after the backup)', () => {
    const backup = vi.fn()
    const apply = (i: number): void => {
      if (i === 1) throw new Error('syntax error near "FOO"')
    }
    expect(() => runMigrations({ version: 0, count: 3, apply, backup })).toThrow(
      /migration 2\/3 failed: syntax error near "FOO"/
    )
    expect(backup).toHaveBeenCalledOnce() // backup happened before the failure
  })

  it('does not apply later migrations after one fails', () => {
    const applied: number[] = []
    const apply = (i: number): void => {
      if (i === 0) throw new Error('boom')
      applied.push(i)
    }
    expect(() => runMigrations({ version: 0, count: 3, apply })).toThrow()
    expect(applied).toEqual([])
  })

  it('refuses to migrate a DB newer than the build (downgrade guard → warn, not corrupt)', () => {
    const apply = vi.fn()
    const onDowngrade = vi.fn()
    const v = runMigrations({ version: 5, count: 3, apply, onDowngrade })
    expect(apply).not.toHaveBeenCalled() // never runs migrations backwards
    expect(onDowngrade).toHaveBeenCalledWith(5, 3)
    expect(v).toBe(5) // left untouched
  })
})
