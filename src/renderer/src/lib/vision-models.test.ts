import { describe, it, expect } from 'vitest'
import { modelSupportsImages, imagesWouldBeDropped } from './vision-models'

describe('modelSupportsImages — known vision/text families (#131)', () => {
  it('recognises vision-capable models', () => {
    for (const id of [
      'anthropic/claude-opus-4',
      'anthropic/claude-3-5-sonnet',
      'openai/gpt-4o',
      'openai/gpt-5',
      'google/gemini-2.0-flash',
      'mistralai/pixtral-12b',
      'qwen/qwen2.5-vl-7b-instruct',
      'meta/llama-3.2-90b-vision'
    ]) {
      expect(modelSupportsImages(id)).toBe(true)
    }
  })

  it('flags confidently text/code-only models (incl. the #131 repro)', () => {
    for (const id of [
      'nvidia/deepseek-v4-pro', // the reported repro
      'deepseek-ai/deepseek-coder',
      'mistralai/codestral-latest',
      'qwen/qwen2.5-coder-32b-instruct',
      'mistralai/mixtral-8x7b'
    ]) {
      expect(modelSupportsImages(id)).toBe(false)
    }
  })

  it('returns null for unknown models (so the UI never falsely warns)', () => {
    expect(modelSupportsImages('some/unknown-model-2030')).toBeNull()
    expect(modelSupportsImages('')).toBeNull()
    expect(modelSupportsImages(null)).toBeNull()
    expect(modelSupportsImages(undefined)).toBeNull()
  })

  it('does not confuse qwen-vl (vision) with qwen-coder (text)', () => {
    expect(modelSupportsImages('qwen/qwen2.5-vl-72b')).toBe(true)
    expect(modelSupportsImages('qwen/qwen2.5-coder-7b')).toBe(false)
  })
})

describe('imagesWouldBeDropped', () => {
  it('is true only for confidently non-vision models', () => {
    expect(imagesWouldBeDropped('nvidia/deepseek-v4-pro')).toBe(true)
    expect(imagesWouldBeDropped('openai/gpt-4o')).toBe(false)
    expect(imagesWouldBeDropped('unknown/model')).toBe(false) // unknown → don't warn
  })
})
