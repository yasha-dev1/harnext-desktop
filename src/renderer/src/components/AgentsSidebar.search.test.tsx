// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
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

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  useAppStore.setState({
    agentIdsByProject: { 1: ['a', 'b', 'c'] },
    agents: {
      a: agent('a', 'running', 'Fix login redirect'),
      b: agent('b', 'done', 'Add CSV export'),
      c: agent('c', 'done', 'Refactor auth context')
    },
    loopsByProject: { 1: [] },
    discardAgent: vi.fn().mockResolvedValue(undefined) as never,
    settings: { displayName: 'Tester' } as never
  })
})

const renderSidebar = (): void => {
  render(
    <MemoryRouter initialEntries={['/project/1']}>
      <AgentsSidebar project={project} />
    </MemoryRouter>
  )
}

describe('AgentsSidebar — conversation search (#116)', () => {
  it('filters the conversation list by title as you type', async () => {
    renderSidebar()
    // All three present initially.
    expect(screen.getByText('Fix login redirect')).toBeInTheDocument()
    expect(screen.getByText('Add CSV export')).toBeInTheDocument()
    expect(screen.getByText('Refactor auth context')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Search conversations'), 'auth')
    await waitFor(() => expect(screen.queryByText('Add CSV export')).not.toBeInTheDocument())
    expect(screen.queryByText('Fix login redirect')).not.toBeInTheDocument()
    expect(screen.getByText('Refactor auth context')).toBeInTheDocument()
  })

  it('shows an empty state when nothing matches', async () => {
    renderSidebar()
    await userEvent.type(screen.getByLabelText('Search conversations'), 'deploy-xyz')
    expect(await screen.findByText(/No conversations match/)).toBeInTheDocument()
    expect(screen.queryByText('Fix login redirect')).not.toBeInTheDocument()
  })

  it('keeps a match across the running/finished split', async () => {
    renderSidebar()
    // "Fix" only matches the running one; finished ones drop out.
    await userEvent.type(screen.getByLabelText('Search conversations'), 'fix')
    expect(screen.getByText('Fix login redirect')).toBeInTheDocument()
    expect(screen.queryByText('Refactor auth context')).not.toBeInTheDocument()
  })
})
