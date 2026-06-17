// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AppSettings, Project } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import { projectDraftKey } from '../lib/draft-keys'
import Compose from './Compose'

const settings = {
  onboarded: true,
  theme: 'dark',
  displayName: 'T',
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
} as AppSettings
const project = { id: 1, name: 'demo', path: '/tmp/demo', isGit: false, branch: 'main' } as Project
const KEY = projectDraftKey(1)

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = {
    onAgentEvent: () => () => {},
    providers: { list: vi.fn().mockResolvedValue([]), models: vi.fn().mockResolvedValue([]) },
    projects: { branches: vi.fn().mockResolvedValue({ current: 'main', local: [], remote: [] }) }
  }
  useAppStore.setState({
    settings,
    projects: [project],
    projectsLoaded: true,
    providerModels: {},
    composerDrafts: {},
    // Two previously-sent prompts, oldest → newest.
    promptHistory: { [KEY]: ['first task', 'second task'] }
  })
})

describe('Compose — ↑/↓ prompt history (#133)', () => {
  it('recalls previous prompts with ↑ and returns to the draft with ↓', async () => {
    render(
      <MemoryRouter initialEntries={['/project/1']}>
        <Routes>
          <Route path="/project/:projectId" element={<Compose />} />
        </Routes>
      </MemoryRouter>
    )
    const user = userEvent.setup()
    const box = (await screen.findByRole('textbox')) as HTMLTextAreaElement
    await user.click(box)

    // ↑ recalls the newest sent prompt, then the older one.
    await user.keyboard('{ArrowUp}')
    expect(box).toHaveValue('second task')
    await user.keyboard('{ArrowUp}')
    expect(box).toHaveValue('first task')

    // ↓ walks forward, then past the newest restores the (empty) draft.
    await user.keyboard('{ArrowDown}')
    expect(box).toHaveValue('second task')
    await user.keyboard('{ArrowDown}')
    expect(box).toHaveValue('')
  })

  it('preserves an in-progress draft as the bottom of the stack', async () => {
    render(
      <MemoryRouter initialEntries={['/project/1']}>
        <Routes>
          <Route path="/project/:projectId" element={<Compose />} />
        </Routes>
      </MemoryRouter>
    )
    const user = userEvent.setup()
    const box = (await screen.findByRole('textbox')) as HTMLTextAreaElement
    await user.click(box)
    await user.type(box, 'half-written')

    await user.keyboard('{ArrowUp}') // into history
    expect(box).toHaveValue('second task')
    await user.keyboard('{ArrowDown}') // back to the draft
    expect(box).toHaveValue('half-written')
  })
})
