import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTwoFilesPatch } from 'diff'
import { countDiffLines, DiffTracker } from './diff-service'

// Regression guard for the diff add/delete counter (QA #36): additions and
// deletions must exclude the `+++`/`---` unified-diff headers.

const patch = (before: string, after: string): string =>
  createTwoFilesPatch('f', 'f', before, after, '', '')

describe('countDiffLines — header exclusion (#36)', () => {
  it('counts a pure addition without counting the +++ header', () => {
    const { additions, deletions } = countDiffLines(patch('a\n', 'a\nb\n'))
    expect(additions).toBe(1)
    expect(deletions).toBe(0)
  })

  it('counts a pure deletion without counting the --- header', () => {
    const { additions, deletions } = countDiffLines(patch('a\nb\n', 'a\n'))
    expect(additions).toBe(0)
    expect(deletions).toBe(1)
  })

  it('counts a mixed edit (one changed line = one add + one delete)', () => {
    const { additions, deletions } = countDiffLines(patch('a\nb\nc\n', 'a\nB\nc\n'))
    expect(additions).toBe(1)
    expect(deletions).toBe(1)
  })

  it('counts a new file’s lines as additions only', () => {
    const { additions, deletions } = countDiffLines(patch('', 'x\ny\nz\n'))
    expect(additions).toBe(3)
    expect(deletions).toBe(0)
  })

  it('explicitly does not miscount the file headers', () => {
    const diff = patch('a\n', 'a\nb\n')
    // Sanity: the diff really does contain the headers we must skip.
    expect(diff).toMatch(/^\+\+\+/m)
    expect(diff).toMatch(/^---/m)
    const { additions, deletions } = countDiffLines(diff)
    // If headers were counted, additions/deletions would each be +1.
    expect(additions + deletions).toBe(1)
  })
})

describe('DiffTracker — snapshot then count against a real file', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'harnext-diff-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('captures additions/deletions for an edit, excluding headers', () => {
    const file = join(dir, 'app.txt')
    writeFileSync(file, 'one\ntwo\nthree\n')
    const t = new DiffTracker(dir)
    t.onToolStart('c1', 'edit', { file_path: file })
    writeFileSync(file, 'one\nTWO\nthree\nfour\n') // change line 2, add line 4
    const change = t.onToolEnd('c1', false)
    expect(change).not.toBeNull()
    expect(change!.additions).toBe(2) // TWO + four
    expect(change!.deletions).toBe(1) // two
  })

  it('returns null when the file is unchanged (no-op)', () => {
    const file = join(dir, 'same.txt')
    writeFileSync(file, 'unchanged\n')
    const t = new DiffTracker(dir)
    t.onToolStart('c2', 'write', { path: file })
    const change = t.onToolEnd('c2', false)
    expect(change).toBeNull()
  })

  it('returns null when the tool errored', () => {
    const file = join(dir, 'err.txt')
    writeFileSync(file, 'a\n')
    const t = new DiffTracker(dir)
    t.onToolStart('c3', 'edit', { file_path: file })
    writeFileSync(file, 'a\nb\n')
    expect(t.onToolEnd('c3', true)).toBeNull()
  })

  it('ignores non-edit/write tools', () => {
    const t = new DiffTracker(dir)
    t.onToolStart('c4', 'bash', { command: 'ls' })
    expect(t.onToolEnd('c4', false)).toBeNull()
  })
})
