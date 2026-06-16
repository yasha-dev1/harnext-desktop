import { describe, it, expect } from 'vitest'
import type { UpdateInfo } from '@shared/types'
import { shouldShowBadge } from './update-badge'

const info = (over: Partial<UpdateInfo>): UpdateInfo => ({
  current: '0.1.19',
  latest: '0.2.0',
  url: 'https://example.test/release',
  isUpdate: true,
  ...over
})

describe('shouldShowBadge (#125)', () => {
  it('shows when a newer release exists', () => {
    expect(shouldShowBadge(info({}))).toBe(true)
  })

  it('does not show when up to date', () => {
    expect(shouldShowBadge(info({ isUpdate: false }))).toBe(false)
  })

  it('does not show when there is no latest tag (failed check)', () => {
    expect(shouldShowBadge(info({ latest: null, isUpdate: false }))).toBe(false)
  })

  it('does not show before any check (null/undefined)', () => {
    expect(shouldShowBadge(null)).toBe(false)
    expect(shouldShowBadge(undefined)).toBe(false)
  })

  it('ignores dismissal — unlike the popup, the badge has no dismiss state', () => {
    // Same available info always badges; there is no second arg to suppress it.
    expect(shouldShowBadge(info({ latest: '0.2.0' }))).toBe(true)
  })
})
