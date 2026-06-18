import { describe, it, expect } from 'vitest'
import { refocusComposer } from './focus'

/** A minimal textarea stand-in that records the order of focus operations. */
function fakeTextarea(value: string): {
  el: HTMLTextAreaElement
  calls: string[]
  caret: [number, number] | null
} {
  const calls: string[] = []
  let caret: [number, number] | null = null
  const el = {
    value,
    blur: () => calls.push('blur'),
    focus: () => calls.push('focus'),
    setSelectionRange: (a: number, b: number) => {
      calls.push('select')
      caret = [a, b]
    }
  } as unknown as HTMLTextAreaElement
  return {
    el,
    calls,
    get caret() {
      return caret
    }
  }
}

describe('refocusComposer', () => {
  it('blurs before focusing so the native widget re-attaches (#191)', () => {
    const ta = fakeTextarea('hello')
    refocusComposer(ta.el)
    // The order is the crux: a plain focus on an already-focused element is a
    // no-op, so blur must come first.
    expect(ta.calls.indexOf('blur')).toBeLessThan(ta.calls.indexOf('focus'))
    expect(ta.calls).toContain('focus')
  })

  it('places the caret at the end of the existing draft', () => {
    const ta = fakeTextarea('hello world')
    refocusComposer(ta.el)
    expect(ta.caret).toEqual([11, 11])
  })

  it('is a no-op for a null ref', () => {
    expect(() => refocusComposer(null)).not.toThrow()
  })
})
