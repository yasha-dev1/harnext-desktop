import { describe, it, expect } from 'vitest'
import { canSubmitComposer } from './composer'

describe('canSubmitComposer — Start/Send enablement (#142)', () => {
  it('is false for empty or whitespace-only text with no attachment', () => {
    expect(canSubmitComposer('', false)).toBe(false)
    expect(canSubmitComposer('   ', false)).toBe(false)
    expect(canSubmitComposer('\n\t ', false)).toBe(false)
  })

  it('is true once there is non-blank text', () => {
    expect(canSubmitComposer('do the thing', false)).toBe(true)
    expect(canSubmitComposer('  hi  ', false)).toBe(true)
  })

  it('is true for an image-only prompt (attachment, no text)', () => {
    expect(canSubmitComposer('', true)).toBe(true)
    expect(canSubmitComposer('   ', true)).toBe(true)
  })
})
