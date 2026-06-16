import { describe, it, expect, vi } from 'vitest'
import { checkForUpdate, type FetchLike } from './check'

// A fake fetch returning a GitHub /releases/latest payload.
const fetchReturning = (body: unknown, ok = true, status = 200): FetchLike =>
  vi.fn(async () => ({ ok, status, json: async () => body }))

describe('checkForUpdate — GitHub releases (#162/#125)', () => {
  it('reports an update when the latest tag is newer', async () => {
    const fetchImpl = fetchReturning({ tag_name: 'v0.2.0', html_url: 'https://gh/rel/0.2.0' })
    const info = await checkForUpdate('0.1.14', { fetchImpl, url: 'x' })
    expect(info).toEqual({
      current: '0.1.14',
      latest: 'v0.2.0',
      url: 'https://gh/rel/0.2.0',
      isUpdate: true
    })
  })

  it('reports no update when already on the latest', async () => {
    const info = await checkForUpdate('0.2.0', {
      fetchImpl: fetchReturning({ tag_name: 'v0.2.0' }),
      url: 'x'
    })
    expect(info.isUpdate).toBe(false)
    expect(info.latest).toBe('v0.2.0')
  })

  it('sends the GitHub Accept header', async () => {
    const fetchImpl = fetchReturning({ tag_name: 'v0.1.14' })
    await checkForUpdate('0.1.14', { fetchImpl, url: 'https://api/x' })
    expect(fetchImpl).toHaveBeenCalledWith('https://api/x', {
      headers: { Accept: 'application/vnd.github+json' }
    })
  })

  it('is a no-op on a non-OK response', async () => {
    const info = await checkForUpdate('0.1.14', {
      fetchImpl: fetchReturning({}, false, 404),
      url: 'x'
    })
    expect(info).toEqual({ current: '0.1.14', latest: null, url: null, isUpdate: false })
  })

  it('ignores drafts / prereleases', async () => {
    const info = await checkForUpdate('0.1.14', {
      fetchImpl: fetchReturning({ tag_name: 'v0.3.0', prerelease: true }),
      url: 'x'
    })
    expect(info.isUpdate).toBe(false)
    expect(info.latest).toBeNull()
  })

  it('never throws — a fetch error resolves to no update', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new Error('network down')
    })
    const info = await checkForUpdate('0.1.14', { fetchImpl, url: 'x' })
    expect(info).toEqual({ current: '0.1.14', latest: null, url: null, isUpdate: false })
  })
})
