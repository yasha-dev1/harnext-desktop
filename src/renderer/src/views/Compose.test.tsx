// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AppSettings, Project } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import Compose from './Compose'

const settings: AppSettings = {
  onboarded: true,
  theme: 'dark',
  displayName: 'Tester',
  provider: 'anthropic',
  model: 'anthropic/claude',
  smart: 'anthropic/claude',
  executor: 'anthropic/claude',
  thinkingLevel: 'medium',
  mode: 'acceptEdits',
  editor: 'code',
  openOnDone: false,
  soundOnDone: false,
  doneSound: 'chime',
  customSoundPath: '',
  evalLoop: true,
  worktreeRoot: '/tmp/wt',
  contextEngineUrl: 'https://app.harnext.dev/api'
}
const project = { id: 1, name: 'demo', path: '/tmp/demo', isGit: false, branch: 'main' } as Project

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = {
    onAgentEvent: () => () => {},
    providers: {
      list: vi.fn().mockResolvedValue([]),
      models: vi.fn().mockResolvedValue([])
    },
    projects: { branches: vi.fn().mockResolvedValue({ current: 'main', local: [], remote: [] }) }
  }
  useAppStore.setState({ settings, projects: [project], projectsLoaded: true, providerModels: {} })
})

const renderCompose = (): void => {
  render(
    <MemoryRouter initialEntries={['/project/1']}>
      <Routes>
        <Route path="/project/:projectId" element={<Compose />} />
      </Routes>
    </MemoryRouter>
  )
}

describe("Compose — 'Start agent' enablement (#142)", () => {
  it('disables Start while the prompt is empty / whitespace, enables it once typed', async () => {
    renderCompose()
    const start = await screen.findByRole('button', { name: /Start agent/ })
    // Empty prompt, no attachment → disabled (the bug: it used to look enabled).
    expect(start).toBeDisabled()

    const box = screen.getByRole('textbox')
    await userEvent.type(box, '   ') // whitespace only is still nothing to send
    expect(start).toBeDisabled()

    await userEvent.type(box, 'add CSV export')
    await waitFor(() => expect(start).toBeEnabled())

    await userEvent.clear(box)
    await waitFor(() => expect(start).toBeDisabled())
  })
})
