import { describe, it, expect } from 'vitest'
import { filterBranches } from './branch-filter'

const BR = ['main', 'develop', 'feature/login', 'feature/signup', 'release/2.0', 'hotfix/crash']

describe('filterBranches — branch switcher search (#136)', () => {
  it('returns all branches for a blank/whitespace query', () => {
    expect(filterBranches(BR, '')).toEqual(BR)
    expect(filterBranches(BR, '   ')).toEqual(BR)
  })

  it('filters by case-insensitive substring', () => {
    expect(filterBranches(BR, 'feature')).toEqual(['feature/login', 'feature/signup'])
    expect(filterBranches(BR, 'LOGIN')).toEqual(['feature/login'])
    expect(filterBranches(BR, '2.0')).toEqual(['release/2.0'])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterBranches(BR, 'nope')).toEqual([])
  })

  it('preserves the original order of matches', () => {
    expect(filterBranches(BR, 'e')).toEqual([
      'develop',
      'feature/login',
      'feature/signup',
      'release/2.0'
    ])
  })
})
