import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock @harnext/core (provider catalog + helpers) and global fetch so the
// provider catalog + credential-verification logic is testable off Electron /
// the network (#138). PROVIDERS is a minimal but representative catalog.
const core = vi.hoisted(() => {
  const PROVIDERS = [
    {
      id: 'anthropic',
      name: 'Anthropic',
      defaultModel: 'claude-opus-4-8',
      local: false,
      envVar: 'ANTHROPIC_API_KEY'
    },
    {
      id: 'fakeprov',
      name: 'Fakeprov',
      defaultModel: 'fp-1',
      local: false,
      envVar: 'FAKEPROV_KEY'
    },
    {
      id: 'ollama',
      name: 'Ollama',
      defaultModel: 'llama3.1',
      local: true,
      defaultBaseUrl: 'http://localhost:11434'
    }
  ]
  return {
    PROVIDERS,
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    getProviderById: vi.fn((id: string) => PROVIDERS.find((p) => p.id === id)),
    getProviderConfig: vi.fn<(id: string) => { baseUrl?: string } | undefined>(),
    getStoredKey: vi.fn<(id: string) => string | undefined>(),
    listNvidiaModels: vi.fn(),
    listOllamaModels: vi.fn(),
    listOpenRouterModels: vi.fn(),
    normalizeOllamaBaseUrl: vi.fn((u: string) => u)
  }
})
vi.mock('@harnext/core', () => core)

import { listProviders, verifyProvider, getProviderModels } from './providers'

const fetchMock = vi.fn()
const res = (status: number, body: unknown = {}): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => body
  }) as Response

beforeEach(() => {
  vi.clearAllMocks()
  core.getProviderById.mockImplementation((id: string) => core.PROVIDERS.find((p) => p.id === id))
  core.getProviderConfig.mockReturnValue(undefined)
  core.getStoredKey.mockReturnValue(undefined)
  core.normalizeOllamaBaseUrl.mockImplementation((u: string) => u)
  vi.stubGlobal('fetch', fetchMock)
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.FAKEPROV_KEY
})
afterEach(() => vi.unstubAllGlobals())

describe('listProviders', () => {
  it('falls back to [defaultModel] for a provider with no curated model list', () => {
    const fake = listProviders().find((p) => p.id === 'fakeprov')!
    expect(fake.models).toEqual(['fp-1'])
  })

  it('keeps the curated favourites for a provider that has them', () => {
    const anth = listProviders().find((p) => p.id === 'anthropic')!
    expect(anth.models).toEqual(['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5'])
    expect(anth.defaultModel).toBe('claude-opus-4-8')
  })

  it('reflects authentication: a stored key authenticates a hosted provider', () => {
    core.getStoredKey.mockImplementation((id: string) => (id === 'anthropic' ? 'sk-1' : undefined))
    const list = listProviders()
    expect(list.find((p) => p.id === 'anthropic')!.authenticated).toBe(true)
    expect(list.find((p) => p.id === 'fakeprov')!.authenticated).toBe(false)
  })

  it('authenticates a local provider by its base URL (no key needed)', () => {
    expect(listProviders().find((p) => p.id === 'ollama')!.authenticated).toBe(true)
  })
})

describe('verifyProvider — ollama (local)', () => {
  it('reports ok with the installed model ids', async () => {
    core.listOllamaModels.mockResolvedValue([{ id: 'llama3.1' }, { id: 'qwen2.5' }])
    const r = await verifyProvider('ollama', {})
    expect(r).toMatchObject({ ok: true, status: 'ok', models: ['llama3.1', 'qwen2.5'] })
  })

  it('reports an error when reachable but no models are installed', async () => {
    core.listOllamaModels.mockResolvedValue([])
    const r = await verifyProvider('ollama', {})
    expect(r.status).toBe('error')
    expect(r.message).toMatch(/no models/i)
  })

  it('reports unreachable when the server cannot be contacted', async () => {
    core.listOllamaModels.mockRejectedValue(new Error('ECONNREFUSED'))
    const r = await verifyProvider('ollama', {})
    expect(r.status).toBe('unreachable')
  })
})

describe('verifyProvider — hosted', () => {
  it('requires a key (no typed key and none stored → auth)', async () => {
    const r = await verifyProvider('anthropic', {})
    expect(r).toMatchObject({ ok: false, status: 'auth' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('verifies a good key against the model listing and returns the ids', async () => {
    fetchMock.mockResolvedValue(res(200, { data: [{ id: 'claude-opus-4-8' }, { id: 'x' }] }))
    const r = await verifyProvider('anthropic', { key: 'sk-good' })
    expect(r).toMatchObject({ ok: true, status: 'ok', models: ['claude-opus-4-8', 'x'] })
  })

  it('maps 401/403 to an auth failure', async () => {
    fetchMock.mockResolvedValue(res(401))
    expect((await verifyProvider('anthropic', { key: 'bad' })).status).toBe('auth')
    fetchMock.mockResolvedValue(res(403))
    expect((await verifyProvider('anthropic', { key: 'bad' })).status).toBe('auth')
  })

  it('maps other non-OK statuses to a generic error', async () => {
    fetchMock.mockResolvedValue(res(500))
    expect((await verifyProvider('anthropic', { key: 'k' })).status).toBe('error')
  })

  it('reports unreachable when fetch throws (network)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    expect((await verifyProvider('anthropic', { key: 'k' })).status).toBe('unreachable')
  })

  it('accepts a provider with no verify spec — saves the key without a probe', async () => {
    const r = await verifyProvider('fakeprov', { key: 'k' })
    expect(r).toMatchObject({ ok: true, status: 'ok', message: 'Key saved', models: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('getProviderModels', () => {
  it('merges the live catalog after the curated favourites, deduped', async () => {
    core.getStoredKey.mockReturnValue('sk-1')
    fetchMock.mockResolvedValue(
      res(200, { data: [{ id: 'claude-opus-4-8' }, { id: 'new-model' }] })
    )
    const models = await getProviderModels('anthropic')
    // curated favourites first, the genuinely-new live id appended, the overlap deduped.
    expect(models[0]).toBe('claude-sonnet-4-6')
    expect(models).toContain('new-model')
    expect(models.filter((m) => m === 'claude-opus-4-8')).toHaveLength(1)
  })

  it('falls back to the curated list when the provider is unconfigured (no key)', async () => {
    core.getStoredKey.mockReturnValue(undefined)
    const models = await getProviderModels('anthropic')
    expect(models).toEqual(['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to the curated list when the live fetch fails', async () => {
    core.getStoredKey.mockReturnValue('sk-1')
    fetchMock.mockResolvedValue(res(500))
    const models = await getProviderModels('anthropic')
    expect(models).toEqual(['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5'])
  })
})
