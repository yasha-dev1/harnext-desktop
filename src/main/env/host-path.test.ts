import { describe, it, expect } from 'vitest'
import { delimiter } from 'node:path'
import { loginShellPath, mergePaths } from './host-path'

describe('mergePaths', () => {
  it('preserves first-seen order and drops duplicates and empties', () => {
    const merged = mergePaths('/usr/bin:/bin', '/usr/local/bin:/usr/bin', '', null, '  /opt/x  ')
    expect(merged.split(delimiter)).toEqual(['/usr/bin', '/bin', '/usr/local/bin', '/opt/x'])
  })

  it('keeps the existing PATH ahead of appended dirs (idempotent re-runs append only)', () => {
    const first = mergePaths('/a:/b', '/b:/c')
    expect(mergePaths(first, '/b:/c')).toBe(first)
  })

  it('returns an empty string when given nothing', () => {
    expect(mergePaths(null, undefined, '')).toBe('')
  })
})

describe('loginShellPath', () => {
  it('extracts the PATH between the sentinels, ignoring rc noise', () => {
    const run = (): string =>
      `welcome banner from .bashrc\n__hx_path_b91c__/usr/local/bin:/usr/bin__hx_path_b91c__`
    // On Windows the function short-circuits to null regardless of the query.
    if (process.platform === 'win32') {
      expect(loginShellPath(run)).toBeNull()
    } else {
      expect(loginShellPath(run)).toBe('/usr/local/bin:/usr/bin')
    }
  })

  it('returns null when the sentinels are absent or the query fails', () => {
    if (process.platform === 'win32') return
    expect(loginShellPath(() => 'no markers here')).toBeNull()
    expect(loginShellPath(() => null)).toBeNull()
  })
})
