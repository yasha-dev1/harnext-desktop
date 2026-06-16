// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AgentMeta, TimelineItem } from '@shared/types'
import { groupTimeline } from '../lib/timeline-groups'
import { StageGroup } from './AgentDetail'

const agent = {
  id: 'ag1',
  mode: 'goal',
  modelId: null,
  smartModel: 'anthropic/claude',
  execModel: 'anthropic/exec'
} as AgentMeta

// A Planner stage: a message + one tool call.
const timeline: TimelineItem[] = [
  {
    kind: 'message',
    seq: 1,
    role: 'plan',
    content: 'Here is the plan',
    verdict: null,
    createdAt: 0
  },
  {
    kind: 'tool',
    seq: 2,
    role: 'plan',
    toolCallId: 't2',
    toolName: 'read',
    args: { path: 'src/app.ts' },
    result: 'ok',
    isError: false,
    startedAt: 0,
    endedAt: 1
  }
]
const group = groupTimeline(timeline)[0]

beforeEach(() => localStorage.clear())

describe('StageGroup — collapsible agent stage (#106)', () => {
  it('shows the stage body, and the header toggles it collapsed/expanded', async () => {
    render(<StageGroup group={group} agent={agent} />)
    const header = screen.getByRole('button', { name: /Planner/ })
    // Expanded by default: the stage message + tool call are visible.
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Here is the plan')).toBeInTheDocument()
    expect(screen.getByText('src/app.ts')).toBeInTheDocument()

    // Click the header → collapses; body disappears.
    await userEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Here is the plan')).not.toBeInTheDocument()
    expect(screen.queryByText('src/app.ts')).not.toBeInTheDocument()

    // Click again → expands.
    await userEvent.click(header)
    expect(screen.getByText('Here is the plan')).toBeInTheDocument()
  })

  it('persists the collapsed state to localStorage (survives reopen)', async () => {
    const first = render(<StageGroup group={group} agent={agent} />)
    await userEvent.click(screen.getByRole('button', { name: /Planner/ }))
    expect(JSON.parse(localStorage.getItem('harnext.stages.ag1') ?? '[]')).toContain(group.key)

    // Re-mount (as if the conversation was reopened) → starts collapsed.
    first.unmount()
    render(<StageGroup group={group} agent={agent} />)
    expect(screen.getByRole('button', { name: /Planner/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(screen.queryByText('Here is the plan')).not.toBeInTheDocument()
  })
})
