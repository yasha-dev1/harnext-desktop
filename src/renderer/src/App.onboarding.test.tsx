// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { JSX } from 'react'
import { render, screen, waitFor, act, cleanup } from '@testing-library/react'

/**
 * Regression test for #82: the in-app file/folder picker must be mounted during
 * onboarding, not only after it. Before the fix, `GlobalFilePicker` lived inside
 * the post-onboarding branch of the tree, so clicking "Browse files…" on the
 * onboarding screen set the `picker` state but nothing rendered the overlay.
 *
 * Rewritten for the jsdom DOM harness (#146): the app is actually rendered with
 * effects running (loadSettings/loadProjects fire against a mocked window.api),
 * and we drive the store the way the UI does — no more renderToStaticMarkup +
 * initial-state monkey-patching.
 */

// Minimal preload bridge: only what the onboarding render path touches.
function installApiMock(): void {
  const api = {
    onAgentEvent: () => () => {},
    settings: { get: vi.fn().mockResolvedValue({ onboarded: false, theme: 'dark' }) },
    projects: { list: vi.fn().mockResolvedValue([]) },
    // FilePicker browses the filesystem when the overlay opens.
    fs: {
      home: vi.fn().mockResolvedValue('/home/tester'),
      listDir: vi.fn().mockResolvedValue([])
    }
  }
  ;(window as unknown as { api: unknown }).api = api
}

async function loadApp(): Promise<{
  App: () => JSX.Element
  useAppStore: { setState: (s: Record<string, unknown>) => void }
}> {
  // window.api must exist before the store module evaluates (it wires
  // onAgentEvent at import time), so import lazily after the mock is installed.
  const App = (await import('./App')).default
  const { useAppStore } = await import('./stores/useAppStore')
  return { App, useAppStore: useAppStore as never }
}

describe('onboarding mounts the file picker (#82)', () => {
  beforeEach(() => {
    vi.resetModules()
    installApiMock()
    cleanup()
  })

  it('shows the picker overlay while onboarding when a pick is pending', async () => {
    const { App, useAppStore } = await loadApp()
    render(<App />)
    // Effects ran: settings loaded → the onboarding screen is shown (not the
    // loading shell), proving we're in the pre-onboarding branch.
    await waitFor(() => expect(document.querySelector('.onb-stage')).toBeTruthy())

    // No overlay yet.
    expect(document.querySelector('.modal-backdrop')).toBeNull()

    // A pending pick (what "Browse files…" triggers) must render the overlay
    // even during onboarding.
    act(() => {
      useAppStore.setState({ picker: { mode: 'dir', resolve: () => {} } })
    })
    await waitFor(() => expect(document.querySelector('.modal-backdrop')).not.toBeNull())
  })

  it('renders no picker overlay when nothing is pending', async () => {
    const { App, useAppStore } = await loadApp()
    render(<App />)
    await waitFor(() => expect(document.querySelector('.win')).toBeTruthy())

    act(() => {
      useAppStore.setState({ picker: null })
    })
    expect(document.querySelector('.modal-backdrop')).toBeNull()
  })
})

describe('renderer DOM harness smoke test (#146)', () => {
  it('jsdom + Testing Library render works', () => {
    render(<div className="hello">harness ready</div>)
    expect(screen.getByText('harness ready')).toBeInTheDocument()
  })
})
