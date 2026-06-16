import { describe, it, expect } from 'vitest'
import { filterConversations } from './conversation-filter'

const C = [
  { title: 'Fix login redirect' },
  { title: 'Add CSV export' },
  { title: 'Refactor auth context' },
  { title: 'Fix flaky tests' }
]

describe('filterConversations — sidebar search (#116)', () => {
  it('returns all for a blank/whitespace query', () => {
    expect(filterConversations(C, '')).toEqual(C)
    expect(filterConversations(C, '   ')).toEqual(C)
  })

  it('filters by case-insensitive title substring', () => {
    expect(filterConversations(C, 'fix').map((c) => c.title)).toEqual([
      'Fix login redirect',
      'Fix flaky tests'
    ])
    expect(filterConversations(C, 'AUTH').map((c) => c.title)).toEqual(['Refactor auth context'])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterConversations(C, 'deploy')).toEqual([])
  })

  it('preserves the original order', () => {
    expect(filterConversations(C, 'e').map((c) => c.title)).toEqual([
      'Fix login redirect',
      'Add CSV export',
      'Refactor auth context',
      'Fix flaky tests'
    ])
  })
})
