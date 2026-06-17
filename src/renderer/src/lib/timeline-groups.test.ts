import { describe, it, expect } from 'vitest'
import type { TimelineItem } from '@shared/types'
import { groupTimeline, stepCount } from './timeline-groups'

const msg = (seq: number, role: TimelineItem['role']): TimelineItem => ({
  kind: 'message',
  seq,
  role,
  content: `m${seq}`,
  verdict: null,
  createdAt: 0
})
const tool = (seq: number, role: TimelineItem['role']): TimelineItem => ({
  kind: 'tool',
  seq,
  role,
  toolCallId: `t${seq}`,
  toolName: 'read',
  args: {},
  result: null,
  isError: false,
  startedAt: 0,
  endedAt: 1
})

describe('groupTimeline — collapsible stage grouping (#106)', () => {
  it('collapses consecutive same-role items into one group', () => {
    const tl = [msg(1, 'user'), msg(2, 'plan'), tool(3, 'plan'), msg(4, 'exec'), tool(5, 'exec')]
    const groups = groupTimeline(tl)
    expect(groups.map((g) => g.role)).toEqual(['user', 'plan', 'exec'])
    expect(groups[1].items.map((i) => i.seq)).toEqual([2, 3])
    expect(groups[2].items.map((i) => i.seq)).toEqual([4, 5])
  })

  it('starts a new group when the role changes, even back to a prior role', () => {
    // plan → exec → eval → exec (revise loop) stays four distinct groups.
    const tl = [msg(1, 'plan'), msg(2, 'exec'), msg(3, 'eval'), msg(4, 'exec')]
    expect(groupTimeline(tl).map((g) => g.role)).toEqual(['plan', 'exec', 'eval', 'exec'])
  })

  it('gives each group a stable key from its role + first seq', () => {
    expect(groupTimeline([msg(7, 'plan'), tool(8, 'plan')])[0].key).toBe('plan:7')
  })

  it('counts tool calls per group for the "N steps" label', () => {
    const g = groupTimeline([msg(1, 'exec'), tool(2, 'exec'), tool(3, 'exec')])[0]
    expect(stepCount(g)).toBe(2)
  })

  it('returns no groups for an empty timeline', () => {
    expect(groupTimeline([])).toEqual([])
  })
})
