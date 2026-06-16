import { describe, it, expect } from 'vitest'
import type { UpdateInfo } from '@shared/types'
import { describeUpdateStatus } from './update-status'

const info = (over: Partial<UpdateInfo>): UpdateInfo => ({
  current: '0.1.18',
  latest: '0.2.0',
  url: 'https://example.test/release',
  isUpdate: true,
  ...over
})

describe('describeUpdateStatus (#125)', () => {
  it('reports an available update with both versions', () => {
    const s = describeUpdateStatus(info({}))
    expect(s.available).toBe(true)
    expect(s.text).toBe('Update available — v0.1.18 → v0.2.0')
  })

  it('reports up-to-date when there is no newer release', () => {
    const s = describeUpdateStatus(info({ isUpdate: false, latest: '0.1.18' }))
    expect(s.available).toBe(false)
    expect(s.text).toBe("You're on the latest version (v0.1.18)")
  })

  it('treats a found-but-no-latest result as up-to-date (defensive)', () => {
    const s = describeUpdateStatus(info({ isUpdate: true, latest: null }))
    expect(s.available).toBe(false)
  })

  it('does not double-prefix versions that already start with v', () => {
    const s = describeUpdateStatus(info({ current: 'v1.0.0', latest: 'v1.1.0' }))
    expect(s.text).toBe('Update available — v1.0.0 → v1.1.0')
  })

  it('returns an empty view before any check has run', () => {
    expect(describeUpdateStatus(null)).toEqual({ available: false, text: '' })
    expect(describeUpdateStatus(undefined)).toEqual({ available: false, text: '' })
  })
})
