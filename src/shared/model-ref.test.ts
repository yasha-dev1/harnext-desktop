import { describe, it, expect } from 'vitest'
import {
  formatModelRef,
  parseModelRef,
  resolveModelProvider,
  migrateBareModel,
  buildModelGroups,
  type ParseOpts
} from './model-ref'

const KNOWN: ParseOpts = {
  providers: ['anthropic', 'openrouter', 'ollama', 'openai'],
  fallback: 'anthropic'
}

describe('formatModelRef', () => {
  it('joins provider and model id with a colon', () => {
    expect(formatModelRef('anthropic', 'claude-opus-4-8')).toBe('anthropic:claude-opus-4-8')
  })
})

describe('parseModelRef', () => {
  it('splits a qualified ref on the first colon when the prefix is a known provider', () => {
    expect(parseModelRef('anthropic:claude-opus-4-8', KNOWN)).toEqual({
      provider: 'anthropic',
      modelId: 'claude-opus-4-8'
    })
  })

  it('keeps slashes in the model id (openrouter style)', () => {
    expect(parseModelRef('openrouter:deepseek/deepseek-chat', KNOWN)).toEqual({
      provider: 'openrouter',
      modelId: 'deepseek/deepseek-chat'
    })
  })

  it('keeps later colons in the model id (ollama tag style)', () => {
    expect(parseModelRef('ollama:llama3:8b', KNOWN)).toEqual({
      provider: 'ollama',
      modelId: 'llama3:8b'
    })
  })

  it('attributes a bare id to the fallback provider (migration path)', () => {
    expect(parseModelRef('claude-opus-4-8', KNOWN)).toEqual({
      provider: 'anthropic',
      modelId: 'claude-opus-4-8'
    })
  })

  it('does NOT treat a legacy bare ollama tag as a provider prefix', () => {
    // `llama3` isn't a known provider, so `llama3:8b` is a bare model id.
    expect(parseModelRef('llama3:8b', KNOWN)).toEqual({
      provider: 'anthropic',
      modelId: 'llama3:8b'
    })
  })

  it('returns an empty model id under the fallback for empty/nullish refs', () => {
    expect(parseModelRef('', KNOWN)).toEqual({ provider: 'anthropic', modelId: '' })
    expect(parseModelRef(null, KNOWN)).toEqual({ provider: 'anthropic', modelId: '' })
    expect(parseModelRef(undefined, KNOWN)).toEqual({ provider: 'anthropic', modelId: '' })
  })
})

describe('resolveModelProvider — smart + executor on different providers (acceptance)', () => {
  it('derives each model selection’s own provider', () => {
    const smart = 'anthropic:claude-opus-4-8'
    const executor = 'openrouter:deepseek/deepseek-chat'
    expect(resolveModelProvider(smart, KNOWN)).toBe('anthropic')
    expect(resolveModelProvider(executor, KNOWN)).toBe('openrouter')
  })

  it('falls back to the active provider for an un-migrated bare id', () => {
    expect(resolveModelProvider('claude-opus-4-8', { ...KNOWN, fallback: 'openai' })).toBe('openai')
  })
})

describe('migrateBareModel (item 5)', () => {
  it('qualifies a bare id under the given provider', () => {
    expect(migrateBareModel('claude-opus-4-8', 'anthropic')).toBe('anthropic:claude-opus-4-8')
  })

  it('is idempotent for an already-qualified ref', () => {
    expect(migrateBareModel('anthropic:claude-opus-4-8', 'anthropic')).toBe(
      'anthropic:claude-opus-4-8'
    )
  })

  it('keeps an empty selection empty', () => {
    expect(migrateBareModel('', 'anthropic')).toBe('')
  })

  it('round-trips through parse back to the original id + provider', () => {
    const ref = migrateBareModel('llama3:8b', 'ollama')
    expect(ref).toBe('ollama:llama3:8b')
    expect(parseModelRef(ref, KNOWN)).toEqual({ provider: 'ollama', modelId: 'llama3:8b' })
  })
})

describe('buildModelGroups (item 2 — cross-provider picker)', () => {
  const providers = [
    {
      id: 'anthropic',
      name: 'Anthropic',
      authenticated: true,
      models: ['claude-opus-4-8', 'claude-sonnet-4-6']
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      authenticated: true,
      models: ['deepseek/deepseek-chat']
    },
    { id: 'openai', name: 'OpenAI', authenticated: false, models: ['gpt-4o'] },
    { id: 'empty', name: 'Empty', authenticated: true, models: [] }
  ]

  it('produces one group per connected provider with models, qualified refs', () => {
    const groups = buildModelGroups(providers)
    expect(groups.map((g) => g.provider)).toEqual(['anthropic', 'openrouter'])
    expect(groups[0].label).toBe('Anthropic')
    expect(groups[0].options[0]).toEqual({
      ref: 'anthropic:claude-opus-4-8',
      modelId: 'claude-opus-4-8'
    })
    expect(groups[1].options[0].ref).toBe('openrouter:deepseek/deepseek-chat')
  })

  it('omits unauthenticated providers and ones with no models', () => {
    const ids = buildModelGroups(providers).map((g) => g.provider)
    expect(ids).not.toContain('openai')
    expect(ids).not.toContain('empty')
  })
})
