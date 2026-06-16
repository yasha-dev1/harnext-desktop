import { describe, it, expect } from 'vitest'
import { parseVersion, compareVersions, isNewerVersion } from './version'

describe('parseVersion', () => {
  it('parses plain and v-prefixed versions', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] })
    expect(parseVersion('v0.1.14')).toEqual({ major: 0, minor: 1, patch: 14, prerelease: [] })
    expect(parseVersion('1.0.0-beta.2')).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: ['beta', '2']
    })
  })
  it('returns null for non-versions', () => {
    expect(parseVersion('nightly')).toBeNull()
    expect(parseVersion('')).toBeNull()
    expect(parseVersion(null)).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders by major/minor/patch', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1)
    expect(compareVersions('0.1.14', '0.1.14')).toBe(0)
    expect(compareVersions('v0.2.0', '0.1.14')).toBe(1) // v-prefix + cross-minor
  })
  it('ranks a release above its prereleases', () => {
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1)
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(-1)
  })
  it('orders prerelease identifiers (numeric and alpha)', () => {
    expect(compareVersions('1.0.0-rc.1', '1.0.0-rc.2')).toBe(-1)
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
    expect(compareVersions('1.0.0-rc.1', '1.0.0-rc.1.1')).toBe(-1) // fewer ids ⇒ lower
  })
  it('treats unparseable input as equal (no update)', () => {
    expect(compareVersions('weird', '1.0.0')).toBe(0)
  })
})

describe('isNewerVersion', () => {
  it('is true only when latest is strictly newer', () => {
    expect(isNewerVersion('0.2.0', '0.1.14')).toBe(true)
    expect(isNewerVersion('0.1.14', '0.1.14')).toBe(false)
    expect(isNewerVersion('0.1.13', '0.1.14')).toBe(false)
    expect(isNewerVersion('1.0.0-rc.1', '1.0.0')).toBe(false) // a prerelease isn't "newer"
  })
})
