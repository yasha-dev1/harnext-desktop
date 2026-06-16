import { describe, it, expect } from 'vitest'
import type { UpdateInfo } from '@shared/types'
import { shouldShowUpdate, updateLabel } from './update-popup'

const info = (over: Partial<UpdateInfo>): UpdateInfo => ({
  current: '0.1.16',
  latest: '0.2.0',
  url: 'https://github.com/yasha-dev1/harnext-desktop/releases/tag/v0.2.0',
  isUpdate: true,
  ...over
})

describe('shouldShowUpdate (#162)', () => {
  it('shows when a newer release was found and nothing was dismissed', () => {
    expect(shouldShowUpdate(info({}), null)).toBe(true)
  })

  it('hides when the check found no update', () => {
    expect(shouldShowUpdate(info({ isUpdate: false }), null)).toBe(false)
  })

  it('hides when there is no latest tag (failed check)', () => {
    expect(shouldShowUpdate(info({ latest: null, isUpdate: false }), null)).toBe(false)
  })

  it('hides when the user already dismissed this exact version', () => {
    expect(shouldShowUpdate(info({ latest: '0.2.0' }), '0.2.0')).toBe(false)
  })

  it('shows again when a newer version than the dismissed one ships', () => {
    expect(shouldShowUpdate(info({ latest: '0.3.0' }), '0.2.0')).toBe(true)
  })

  it('handles null/undefined info', () => {
    expect(shouldShowUpdate(null, null)).toBe(false)
    expect(shouldShowUpdate(undefined, '0.2.0')).toBe(false)
  })
})

describe('updateLabel', () => {
  it('renders current → latest, adding the v prefix', () => {
    expect(updateLabel(info({ current: '0.1.16', latest: '0.2.0' }))).toBe('v0.1.16 → v0.2.0')
  })

  it('does not double-prefix versions that already start with v', () => {
    expect(updateLabel(info({ current: 'v1.0.0', latest: 'v1.1.0' }))).toBe('v1.0.0 → v1.1.0')
  })

  it('falls back to just the current version when latest is missing', () => {
    expect(updateLabel(info({ latest: null }))).toBe('v0.1.16')
  })
})
