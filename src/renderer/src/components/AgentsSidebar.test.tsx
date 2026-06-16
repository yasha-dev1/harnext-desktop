// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AgentMeta, Project } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import AgentsSidebar from './AgentsSidebar'

const project = { id: 1, name: 'demo', path: '/tmp/demo', isGit: true, branch: 'main' } as Project

function agent(id: string, status: AgentMeta['status'], title: string): AgentMeta {
  return {
    id,
    projectId: 1,
    title,
    status,
    mode: 'single',
    modelId: 'anthropic/claude',
    smartModel: null,
    execModel: null,
    permissionMode: 'acceptEdits',
    branch: `agent/${id}`,
    worktreePath: null,
    progress: 'done',
    error: null,
    live: status !== 'done' && status !== 'failed',
    add: 0,
    del: 0,
    createdAt: 0,
    updatedAt: 0
  }
}

const renderSidebar = (): void => {
  render(
    <MemoryRouter initialEntries={['/project/1']}>
      <AgentsSidebar project={project} />
    </MemoryRouter>
  )
}

describe('AgentsSidebar — discard available for all sessions (#135)', () => {
  let discardAgent: ReturnType<typeof vi.fn>

  beforeEach(() => {
    discardAgent = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    useAppStore.setState({
      agentIdsByProject: { 1: ['run1', 'done1'] },
      agents: {
        run1: agent('run1', 'running', 'A running task'),
        done1: agent('done1', 'done', 'A finished task')
      },
      loopsByProject: { 1: [] },
      discardAgent: discardAgent as never,
      settings: { displayName: 'Tester' } as never
    })
  })

  it('shows a discard control on the finished/"Recent" card too', () => {
    renderSidebar()
    // Both the active and the finished card are present…
    const finishedCard = screen.getByText('A finished task').closest('.agent-card') as HTMLElement
    const runningCard = screen.getByText('A running task').closest('.agent-card') as HTMLElement
    // …and BOTH now expose the discard control (the bug: only the running one did).
    expect(within(finishedCard).getByRole('button', { name: 'Discard agent' })).toBeInTheDocument()
    expect(within(runningCard).getByRole('button', { name: 'Discard agent' })).toBeInTheDocument()
  })

  it('discards a finished session when its trash control is clicked', async () => {
    renderSidebar()
    const finishedCard = screen.getByText('A finished task').closest('.agent-card') as HTMLElement
    await userEvent.click(within(finishedCard).getByRole('button', { name: 'Discard agent' }))
    expect(discardAgent).toHaveBeenCalledWith('done1')
  })
})
