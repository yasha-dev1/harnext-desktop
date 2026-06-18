import { describe, it, expect } from 'vitest'
import { toPickerGroups, canonicalRef } from './model-picker'

const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', authenticated: true, models: ['claude-opus-4-8'] },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    authenticated: true,
    models: ['deepseek/deepseek-chat']
  },
  { id: 'openai', name: 'OpenAI', authenticated: false, models: ['gpt-5.1'] }
]
const IDS = PROVIDERS.map((p) => p.id)

describe('toPickerGroups — adapt the cross-provider catalog to the picker', () => {
  it('emits one group per authenticated provider, options carrying the ref', () => {
    const groups = toPickerGroups(PROVIDERS)
    expect(groups.map((g) => g.label)).toEqual(['Anthropic', 'OpenRouter'])
    expect(groups[0].options[0]).toEqual({
      value: 'anthropic:claude-opus-4-8',
      label: 'claude-opus-4-8'
    })
    expect(groups[1].options[0]).toEqual({
      value: 'openrouter:deepseek/deepseek-chat',
      label: 'deepseek/deepseek-chat'
    })
  })

  it('omits unauthenticated providers', () => {
    expect(toPickerGroups(PROVIDERS).some((g) => g.label === 'OpenAI')).toBe(false)
  })
})

describe('canonicalRef — normalize a stored value for the picker', () => {
  it('qualifies a legacy bare id under the fallback provider', () => {
    expect(canonicalRef('claude-opus-4-8', IDS, 'anthropic')).toBe('anthropic:claude-opus-4-8')
  })

  it('keeps an already-qualified cross-provider ref intact', () => {
    expect(canonicalRef('openrouter:deepseek/deepseek-chat', IDS, 'anthropic')).toBe(
      'openrouter:deepseek/deepseek-chat'
    )
  })

  it('does not mistake a legacy ollama tag for a provider ref', () => {
    expect(canonicalRef('llama3:8b', IDS, 'ollama')).toBe('ollama:llama3:8b')
  })
})
