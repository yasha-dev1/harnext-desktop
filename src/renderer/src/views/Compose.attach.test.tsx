// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import type { AppSettings, Project } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import Compose from './Compose'

const baseSettings = {
  onboarded: true,
  theme: 'dark',
  displayName: 'T',
  provider: 'nvidia',
  smart: 'anthropic/claude-opus-4',
  executor: 'anthropic/claude-opus-4',
  thinkingLevel: 'medium',
  mode: 'acceptEdits',
  editor: 'code',
  openOnDone: false,
  soundOnDone: false,
  doneSound: 'chime',
  customSoundPath: '',
  evalLoop: true,
  worktreeRoot: '/tmp/wt'
} as AppSettings
const project = { id: 1, name: 'demo', path: '/tmp/demo', isGit: false, branch: 'main' } as Project

function setup(model: string): void {
  ;(window as unknown as { api: unknown }).api = {
    onAgentEvent: () => () => {},
    providers: { list: vi.fn().mockResolvedValue([]), models: vi.fn().mockResolvedValue([]) },
    projects: { branches: vi.fn().mockResolvedValue({ current: 'main', local: [], remote: [] }) }
  }
  useAppStore.setState({
    settings: { ...baseSettings, model },
    projects: [project],
    projectsLoaded: true,
    providerModels: {},
    composerDrafts: {}
  })
}

const renderCompose = async (): Promise<HTMLElement> => {
  render(
    <MemoryRouter initialEntries={['/project/1']}>
      <Routes>
        <Route path="/project/:projectId" element={<Compose />} />
      </Routes>
    </MemoryRouter>
  )
  return (await screen.findByRole('button', { name: 'Attach images' })) as HTMLElement
}

describe('Compose — non-vision attach warning (#131)', () => {
  beforeEach(() => useAppStore.setState({ composerDrafts: {} }))

  it('warns on the attach button when the model can not read images', async () => {
    setup('nvidia/deepseek-v4-pro') // the reported repro — text/code model
    const attach = await renderCompose()
    expect(attach.getAttribute('title')).toMatch(/can't read images/i)
  })

  it('keeps the normal tooltip for a vision-capable model', async () => {
    setup('openai/gpt-4o')
    const attach = await renderCompose()
    expect(attach.getAttribute('title')).toBe('Attach images')
  })

  it('does not warn for an unknown model (no false positives)', async () => {
    setup('some/unknown-model')
    const attach = await renderCompose()
    expect(attach.getAttribute('title')).toBe('Attach images')
  })
})
