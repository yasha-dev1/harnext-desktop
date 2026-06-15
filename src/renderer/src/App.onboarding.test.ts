import { describe, it, expect, beforeAll, afterAll } from 'vitest'

/**
 * Regression test for #82: the in-app file/folder picker must be mounted during
 * onboarding, not only after it. Before the fix, `GlobalFilePicker` lived inside
 * the post-onboarding branch of the tree, so clicking "Browse files…" on the
 * onboarding screen set the `picker` state but nothing rendered the overlay.
 *
 * The app renders through <HashRouter>, which needs a DOM. This repo's test
 * environment is `node` (no jsdom), so we:
 *   1. stub just enough of window/document for the router's history to init, and
 *   2. static-render <App/> with `renderToStaticMarkup`.
 *
 * zustand v5 serves its *server* snapshot from `getInitialState()`, so under
 * static rendering the store reports its initial state regardless of setState.
 * `getInitialState()` returns the live initial-state object, so we temporarily
 * mutate that object in place to describe the onboarding state we want to assert
 * on, then restore it. Effects never run under static render, so the picker's
 * filesystem IPC is not exercised — we only assert the overlay shell
 * (`.modal-backdrop`) is present (or absent).
 */
function installDomStub(): void {
  const noop = (): void => undefined
  const location = { hash: '#/', pathname: '/', search: '', href: 'http://localhost/#/' }
  const history = {
    pushState: noop,
    replaceState: noop,
    go: noop,
    back: noop,
    forward: noop,
    state: null,
    length: 1,
    scrollRestoration: 'auto'
  }
  const win: Record<string, unknown> = {
    // The store wires window.api.onAgentEvent at module-eval time.
    api: { onAgentEvent: () => noop },
    location,
    history,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => true
  }
  const doc = {
    querySelector: () => null,
    querySelectorAll: () => [],
    location,
    defaultView: win,
    documentElement: { dataset: {}, style: {} },
    createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }),
    addEventListener: noop,
    removeEventListener: noop
  }
  win.document = doc
  const g = globalThis as unknown as Record<string, unknown>
  g.window = win
  g.document = doc
  g.location = location
  g.history = history
}

type AnyRecord = Record<string, unknown>

describe('onboarding mounts the file picker (#82)', () => {
  let render: (state: AnyRecord) => string
  let restore: () => void

  beforeAll(async () => {
    installDomStub()
    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const store = (await import('./stores/useAppStore')).useAppStore as unknown as {
      getInitialState: () => AnyRecord
    }
    const App = (await import('./App')).default

    // The live initial-state object the server snapshot reads from.
    const initial = store.getInitialState()
    const pristine = { ...initial }
    restore = () => {
      for (const k of Object.keys(initial)) delete initial[k]
      Object.assign(initial, pristine)
    }
    render = (state) => {
      Object.assign(initial, state)
      try {
        return renderToStaticMarkup(createElement(App))
      } finally {
        restore()
      }
    }
  })

  afterAll(() => restore?.())

  it('renders the picker overlay while onboarding when a pick is pending', () => {
    const html = render({
      settings: { onboarded: false, theme: 'dark' },
      projects: [],
      picker: { mode: 'dir', resolve: () => {} }
    })
    expect(html).toContain('modal-backdrop')
  })

  it('renders no picker overlay when nothing is pending', () => {
    const html = render({
      settings: { onboarded: false, theme: 'dark' },
      projects: [],
      picker: null
    })
    expect(html).not.toContain('modal-backdrop')
  })
})
