// Guards against external links replacing the whole app window.
//
// The main BrowserWindow already routes *new-window* opens to the system
// browser (setWindowOpenHandler), but a plain in-window navigation (clicking a
// bare `<a href>` rendered from conversation markdown) is a `will-navigate`,
// which Electron allows by default — stranding the user on an external page
// with no app chrome or way back (issue #130).
//
// This module is intentionally free of any Electron imports so the decision
// logic can be unit-tested in a plain Node environment. The caller wires the
// real `shell.openExternal` / `event.preventDefault`.

export interface NavigationEnv {
  /** Whether the renderer is served by the dev server (vs. the file:// bundle). */
  isDev: boolean
  /** The dev server URL (`ELECTRON_RENDERER_URL`) when running in dev. */
  rendererUrl?: string
}

/**
 * Should this navigation target open in the system browser instead of
 * replacing the app window?
 *
 * Internal (allowed in-window): the dev-server origin in dev, or `file://`
 * bundle content in production. Everything else — http(s) sites, mailto:, etc.
 * — is external and must be diverted. Unparseable targets and app-internal
 * schemes (about:, devtools:, chrome:) are left alone.
 */
export function shouldOpenExternally(targetUrl: string, env: NavigationEnv): boolean {
  let target: URL
  try {
    target = new URL(targetUrl)
  } catch {
    // Not an absolute URL we can reason about — don't intercept.
    return false
  }

  // Electron/devtools internals are never "external".
  if (
    target.protocol === 'about:' ||
    target.protocol === 'devtools:' ||
    target.protocol === 'chrome:'
  ) {
    return false
  }

  if (env.isDev && env.rendererUrl) {
    try {
      const renderer = new URL(env.rendererUrl)
      // Same origin as the dev server is the app itself.
      return target.origin !== renderer.origin
    } catch {
      // Fall through to the production rule if rendererUrl is malformed.
    }
  }

  // Production (and dev fallback): the app is the bundled file:// content;
  // anything with another scheme is external.
  return target.protocol !== 'file:'
}

export interface NavigationHandlerDeps {
  env: NavigationEnv
  openExternal: (url: string) => void
}

/** A `will-navigate` / `will-redirect` listener that diverts external
 * navigations to the system browser and keeps the app window in place. */
export function createNavigationHandler(
  deps: NavigationHandlerDeps
): (event: { preventDefault: () => void }, url: string) => void {
  return (event, url) => {
    if (shouldOpenExternally(url, deps.env)) {
      event.preventDefault()
      deps.openExternal(url)
    }
  }
}
