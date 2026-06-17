import { describe, it, expect } from 'vitest'
import { navigateHistory, caretAtEdge, pushHistory } from './composer-history'

const H = ['first prompt', 'second prompt', 'third prompt'] // oldest → newest

describe('navigateHistory — shell-style ↑/↓ recall (#133)', () => {
  it('↑ from the draft jumps to the newest sent prompt', () => {
    expect(navigateHistory('up', H, null, 'draft')).toEqual({ index: 2, text: 'third prompt' })
  })

  it('↑ keeps walking back through older prompts and clamps at the oldest', () => {
    expect(navigateHistory('up', H, 2, 'draft')).toEqual({ index: 1, text: 'second prompt' })
    expect(navigateHistory('up', H, 1, 'draft')).toEqual({ index: 0, text: 'first prompt' })
    expect(navigateHistory('up', H, 0, 'draft')).toEqual({ index: 0, text: 'first prompt' })
  })

  it('↓ walks forward and stepping past the newest restores the draft', () => {
    expect(navigateHistory('down', H, 0, 'draft')).toEqual({ index: 1, text: 'second prompt' })
    expect(navigateHistory('down', H, 2, 'my draft')).toEqual({ index: null, text: 'my draft' })
  })

  it('↓ on the draft is a no-op (already at the bottom)', () => {
    expect(navigateHistory('down', H, null, 'draft')).toEqual({ index: null, text: 'draft' })
  })

  it('↑ with empty history keeps the draft', () => {
    expect(navigateHistory('up', [], null, 'draft')).toEqual({ index: null, text: 'draft' })
  })
})

describe('caretAtEdge', () => {
  it('treats an empty/single-line field as both edges', () => {
    expect(caretAtEdge('', 0, 0)).toEqual({ atFirstLine: true, atLastLine: true })
    expect(caretAtEdge('one line', 4, 4)).toEqual({ atFirstLine: true, atLastLine: true })
  })

  it('detects first vs last line in multi-line text', () => {
    const v = 'line1\nline2\nline3'
    expect(caretAtEdge(v, 3, 3)).toEqual({ atFirstLine: true, atLastLine: false }) // in line1
    expect(caretAtEdge(v, v.length, v.length)).toEqual({ atFirstLine: false, atLastLine: true })
    expect(caretAtEdge(v, 8, 8)).toEqual({ atFirstLine: false, atLastLine: false }) // middle line
  })

  it('is never an edge while text is selected', () => {
    expect(caretAtEdge('hello', 0, 5)).toEqual({ atFirstLine: false, atLastLine: false })
  })
})

describe('pushHistory', () => {
  it('appends sent prompts', () => {
    expect(pushHistory(['a'], 'b')).toEqual(['a', 'b'])
  })
  it('drops blanks and consecutive duplicates', () => {
    expect(pushHistory(['a'], '   ')).toEqual(['a'])
    expect(pushHistory(['a', 'b'], 'b')).toEqual(['a', 'b'])
    expect(pushHistory(['a'], '  a  ')).toEqual(['a']) // trimmed dupe
  })
  it('caps the history length, dropping the oldest', () => {
    const long = Array.from({ length: 50 }, (_, i) => `p${i}`)
    const next = pushHistory(long, 'newest', 50)
    expect(next).toHaveLength(50)
    expect(next[0]).toBe('p1')
    expect(next[49]).toBe('newest')
  })
})
