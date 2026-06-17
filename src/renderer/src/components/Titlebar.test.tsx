// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Project } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import Titlebar from './Titlebar'

const project = { id: 1, name: 'demo', path: '/tmp/demo', isGit: true, branch: 'main' } as Project
const BRANCHES = {
  current: 'main',
  local: ['main', 'develop', 'feature/login', 'feature/signup'],
  remote: ['origin/release-2.0']
}

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = {
    onAgentEvent: () => () => {},
    projects: { branches: vi.fn().mockResolvedValue(BRANCHES), touch: vi.fn() }
  }
  useAppStore.setState({ checkoutBranch: vi.fn().mockResolvedValue(undefined) as never })
})

const open = async (): Promise<void> => {
  render(
    <MemoryRouter>
      <Titlebar projects={[project]} current={project} settingsActive={false} />
    </MemoryRouter>
  )
  await userEvent.click(screen.getByTitle(/Switch branch/))
  await screen.findByLabelText('Search branches') // appears once branches load
}

describe('Titlebar branch switcher — search + scroll (#136)', () => {
  it('lists every branch and filters them as you type', async () => {
    await open()
    // All branches present initially.
    expect(screen.getByRole('button', { name: /feature\/login/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /origin\/release-2\.0/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /develop/ })).toBeInTheDocument()

    // Typing narrows the list (case-insensitive).
    await userEvent.type(screen.getByLabelText('Search branches'), 'FEATURE')
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /develop/ })).not.toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: /feature\/login/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /feature\/signup/ })).toBeInTheDocument()
  })

  it('shows a "no match" message when nothing matches', async () => {
    await open()
    await userEvent.type(screen.getByLabelText('Search branches'), 'zzz-nope')
    expect(await screen.findByText(/No branches match/)).toBeInTheDocument()
  })

  it('puts the branch list in a scrollable container', async () => {
    await open()
    expect(document.querySelector('.tb-pop-list')).toBeTruthy()
  })
})

describe('Titlebar update badge (#125)', () => {
  const renderBar = (updateAvailable?: boolean): void => {
    render(
      <MemoryRouter>
        <Titlebar
          projects={[project]}
          current={project}
          settingsActive={false}
          updateAvailable={updateAvailable}
        />
      </MemoryRouter>
    )
  }

  it('shows the update dot on the Settings entry when an update is available', () => {
    renderBar(true)
    expect(screen.getByLabelText('Update available')).toBeInTheDocument()
    expect(screen.getByTitle(/update available/i)).toBeInTheDocument()
  })

  it('shows no badge when up to date (and defaults to off)', () => {
    renderBar(false)
    expect(screen.queryByLabelText('Update available')).toBeNull()
    expect(screen.getByTitle('Settings')).toBeInTheDocument()
  })
})
