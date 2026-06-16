import { describe, it, expect } from 'vitest'
import { parsePrepNames, cleanTitle, cleanBranchName } from './prep-names'

describe('parsePrepNames — title + branch from the prepare step (#114)', () => {
  it('parses the labelled two-line response', () => {
    expect(parsePrepNames('Title: Add CSV Export to Reports\nBranch: add-csv-export')).toEqual({
      title: 'Add CSV Export to Reports',
      branchName: 'add-csv-export'
    })
  })

  it('is case-insensitive and tolerates extra prose around the lines', () => {
    const out = 'Sure!\nTITLE:  Fix Login Redirect \nbranch name: fix-login-redirect\nDone.'
    expect(parsePrepNames(out)).toEqual({
      title: 'Fix Login Redirect',
      branchName: 'fix-login-redirect'
    })
  })

  it('strips quotes / markdown / agent prefixes', () => {
    expect(parsePrepNames('Title: "Refactor Auth Context"\nBranch: agent/refactor-auth')).toEqual({
      title: 'Refactor Auth Context',
      branchName: 'refactor-auth'
    })
  })

  it('falls back to the first non-empty line as the title when unlabelled', () => {
    expect(parsePrepNames('Upgrade Dependencies')).toEqual({
      title: 'Upgrade Dependencies',
      branchName: null
    })
  })

  it('does not treat a leading Branch: line as the title', () => {
    expect(parsePrepNames('Branch: only-a-branch')).toEqual({
      title: '',
      branchName: 'only-a-branch'
    })
  })

  it('returns empty title / null branch for blank input', () => {
    expect(parsePrepNames('')).toEqual({ title: '', branchName: null })
    expect(parsePrepNames('\n  \n')).toEqual({ title: '', branchName: null })
  })
})

describe('cleanTitle', () => {
  it('takes the first line, strips noise, and caps the length', () => {
    expect(cleanTitle('## **My Title** ')).toBe('My Title')
    expect(cleanTitle('Title: Hello There\nsecond line')).toBe('Hello There')
    expect(cleanTitle('x'.repeat(100))).toHaveLength(70)
  })
})

describe('cleanBranchName', () => {
  it('drops agent/feature prefixes and quotes', () => {
    expect(cleanBranchName('feature/add-export')).toBe('add-export')
    expect(cleanBranchName('Branch: `fix-bug`')).toBe('fix-bug')
  })
})
