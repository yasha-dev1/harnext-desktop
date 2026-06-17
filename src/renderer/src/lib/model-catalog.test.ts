import { describe, it, expect } from 'vitest'
import { buildModelCatalog, parseModelRef, formatModelRef } from './model-catalog'

const PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    authenticated: true,
    models: ['claude-opus-4-8', 'claude-haiku-4-5']
  },
  { id: 'openrouter', name: 'OpenRouter', authenticated: true, models: ['deepseek/deepseek-v3.2'] },
  { id: 'openai', name: 'OpenAI', authenticated: false, models: ['gpt-5.1'] } // not signed in
]

describe('buildModelCatalog — cross-provider model catalog (#103)', () => {
  it('flattens models from every authenticated provider, tagged + ref’d', () => {
    const cat = buildModelCatalog(PROVIDERS)
    expect(cat.map((e) => e.ref)).toEqual([
      'anthropic:claude-opus-4-8',
      'anthropic:claude-haiku-4-5',
      'openrouter:deepseek/deepseek-v3.2'
    ])
    expect(cat[0]).toEqual({
      ref: 'anthropic:claude-opus-4-8',
      provider: 'anthropic',
      providerName: 'Anthropic',
      model: 'claude-opus-4-8',
      label: 'claude-opus-4-8 · Anthropic'
    })
  })

  it('excludes unauthenticated providers', () => {
    expect(buildModelCatalog(PROVIDERS).some((e) => e.provider === 'openai')).toBe(false)
  })

  it('keeps same-named models from different providers distinct (the #103 point)', () => {
    const cat = buildModelCatalog([
      { id: 'anthropic', name: 'Anthropic', authenticated: true, models: ['claude'] },
      { id: 'openrouter', name: 'OpenRouter', authenticated: true, models: ['claude'] }
    ])
    expect(cat.map((e) => e.ref)).toEqual(['anthropic:claude', 'openrouter:claude'])
  })

  it('dedupes repeated refs and preserves order', () => {
    const cat = buildModelCatalog([
      { id: 'x', name: 'X', authenticated: true, models: ['a', 'b', 'a'] }
    ])
    expect(cat.map((e) => e.model)).toEqual(['a', 'b'])
  })

  it('returns [] when nothing is authenticated', () => {
    expect(
      buildModelCatalog([{ id: 'x', name: 'X', authenticated: false, models: ['a'] }])
    ).toEqual([])
  })
})

describe('parseModelRef / formatModelRef', () => {
  it('round-trips, splitting on the first colon (model may contain slashes)', () => {
    expect(formatModelRef('openrouter', 'deepseek/deepseek-v3.2')).toBe(
      'openrouter:deepseek/deepseek-v3.2'
    )
    expect(parseModelRef('openrouter:deepseek/deepseek-v3.2')).toEqual({
      provider: 'openrouter',
      model: 'deepseek/deepseek-v3.2'
    })
  })

  it('rejects malformed refs', () => {
    expect(parseModelRef('no-colon')).toBeNull()
    expect(parseModelRef(':leading')).toBeNull()
    expect(parseModelRef('trailing:')).toBeNull()
  })
})
