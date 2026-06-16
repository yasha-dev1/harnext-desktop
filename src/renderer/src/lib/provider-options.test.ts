import { describe, it, expect } from 'vitest'
import { buildProviderOptions } from './provider-options'

// Mirrors the QA-sweep repro in #141.
const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', authenticated: false },
  { id: 'openai', name: 'OpenAI', authenticated: true },
  { id: 'openrouter', name: 'OpenRouter', authenticated: true },
  { id: 'nvidia', name: 'NVIDIA', authenticated: true },
  { id: 'ollama', name: 'Ollama', authenticated: true }
]

describe('buildProviderOptions — provider select desync guard (#141)', () => {
  it('lists only authenticated providers when the resolved one is among them', () => {
    const opts = buildProviderOptions(PROVIDERS, 'openai')
    expect(opts.map((o) => o.id)).toEqual(['openai', 'openrouter', 'nvidia', 'ollama'])
    expect(opts.every((o) => o.connected)).toBe(true)
  })

  it('always includes the resolved provider even when it is not authenticated', () => {
    // The exact repro: default is anthropic, which has no key.
    const opts = buildProviderOptions(PROVIDERS, 'anthropic')
    const ids = opts.map((o) => o.id)
    expect(ids).toContain('anthropic')
    // …so the controlled <select value="anthropic"> has a matching option and
    // can't silently fall back to rendering "OpenAI".
    expect(ids[0]).toBe('anthropic')
  })

  it('flags the unauthenticated resolved provider as not connected, with its name', () => {
    const opt = buildProviderOptions(PROVIDERS, 'anthropic')[0]
    expect(opt).toEqual({ id: 'anthropic', label: 'Anthropic (not connected)', connected: false })
  })

  it('falls back to the raw id when the provider is unknown', () => {
    const opt = buildProviderOptions(PROVIDERS, 'mystery')[0]
    expect(opt).toEqual({ id: 'mystery', label: 'mystery (not connected)', connected: false })
  })

  it('handles no authenticated providers at all (keeps the resolved one)', () => {
    const none = PROVIDERS.map((p) => ({ ...p, authenticated: false }))
    const opts = buildProviderOptions(none, 'anthropic')
    expect(opts).toEqual([
      { id: 'anthropic', label: 'Anthropic (not connected)', connected: false }
    ])
  })

  it('returns an empty list when there is no provider and none are authed', () => {
    const none = PROVIDERS.map((p) => ({ ...p, authenticated: false }))
    expect(buildProviderOptions(none, '')).toEqual([])
  })

  it('does not duplicate the resolved provider when it is authenticated', () => {
    const ids = buildProviderOptions(PROVIDERS, 'nvidia').map((o) => o.id)
    expect(ids.filter((id) => id === 'nvidia')).toHaveLength(1)
  })
})
