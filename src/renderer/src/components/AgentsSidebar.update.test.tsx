// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import type { Project, UpdateInfo } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import AgentsSidebar from './AgentsSidebar'

const project = { id: 1, name: 'demo', path: '/tmp/demo', isGit: true, branch: 'main' } as Project

const renderSidebar = (update: UpdateInfo | null): void => {
  useAppStore.setState({
    agentIdsByProject: { 1: [] },
    agents: {},
    loopsByProject: { 1: [] },
    update
  })
  render(
    <MemoryRouter initialEntries={['/project/1']}>
      <AgentsSidebar project={project} />
    </MemoryRouter>
  )
}

describe('AgentsSidebar — update-available badge on the Settings entry (#125)', () => {
  beforeEach(() => useAppStore.setState({ update: null }))

  it('shows the badge when a newer release is available', () => {
    renderSidebar({
      current: '0.1.0',
      latest: '0.2.0',
      isUpdate: true,
      url: 'https://x'
    } as UpdateInfo)
    expect(screen.getByLabelText('Update available')).toBeInTheDocument()
  })

  it('shows no badge when on the latest version', () => {
    renderSidebar({ current: '0.2.0', latest: '0.2.0', isUpdate: false, url: null } as UpdateInfo)
    expect(screen.queryByLabelText('Update available')).toBeNull()
  })

  it('shows no badge before any update check has run', () => {
    renderSidebar(null)
    expect(screen.queryByLabelText('Update available')).toBeNull()
  })
})
