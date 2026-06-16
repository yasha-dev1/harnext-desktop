import { describe, it, expect, vi } from 'vitest'
import { shouldOpenExternally, createNavigationHandler } from './navigation'

const DEV = { isDev: true, rendererUrl: 'http://localhost:5173' }
const PROD = { isDev: false, rendererUrl: undefined }

describe('shouldOpenExternally — external link guard (issue #130)', () => {
  describe('dev (renderer served by dev server)', () => {
    it('treats the dev-server origin as internal (in-window)', () => {
      expect(shouldOpenExternally('http://localhost:5173/', DEV)).toBe(false)
      expect(shouldOpenExternally('http://localhost:5173/project/1', DEV)).toBe(false)
    })

    it('diverts a different origin to the system browser', () => {
      expect(shouldOpenExternally('https://github.com/yasha-dev1/harnext-desktop', DEV)).toBe(true)
      // Same host, different port is still a different origin → external.
      expect(shouldOpenExternally('http://localhost:9999/', DEV)).toBe(true)
    })
  })

  describe('production (file:// bundle)', () => {
    it('treats bundled file:// content as internal', () => {
      expect(shouldOpenExternally('file:///app/renderer/index.html', PROD)).toBe(false)
    })

    it('diverts any http(s) site to the system browser', () => {
      expect(shouldOpenExternally('https://example.com/docs', PROD)).toBe(true)
      expect(shouldOpenExternally('http://example.com', PROD)).toBe(true)
    })

    it('diverts other external schemes (mailto)', () => {
      expect(shouldOpenExternally('mailto:hi@example.com', PROD)).toBe(true)
    })
  })

  describe('schemes that must never be intercepted', () => {
    it('leaves Electron/devtools internals alone', () => {
      expect(shouldOpenExternally('about:blank', PROD)).toBe(false)
      expect(shouldOpenExternally('devtools://devtools/bundled/inspector.html', PROD)).toBe(false)
      expect(shouldOpenExternally('chrome://gpu', PROD)).toBe(false)
    })

    it('leaves unparseable / relative targets alone', () => {
      expect(shouldOpenExternally('not a url', PROD)).toBe(false)
      expect(shouldOpenExternally('/project/1', PROD)).toBe(false)
      expect(shouldOpenExternally('', PROD)).toBe(false)
    })
  })

  it('falls back to the production rule when rendererUrl is malformed in dev', () => {
    const badDev = { isDev: true, rendererUrl: '::::not-a-url' }
    expect(shouldOpenExternally('https://example.com', badDev)).toBe(true)
    expect(shouldOpenExternally('file:///app/index.html', badDev)).toBe(false)
  })
})

describe('createNavigationHandler — will-navigate wiring (issue #130)', () => {
  it('prevents the navigation and opens externally for external URLs', () => {
    const openExternal = vi.fn()
    const handler = createNavigationHandler({ env: PROD, openExternal })
    const event = { preventDefault: vi.fn() }

    handler(event, 'https://github.com/yasha-dev1/harnext-desktop')

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(openExternal).toHaveBeenCalledWith('https://github.com/yasha-dev1/harnext-desktop')
  })

  it('lets internal navigations proceed untouched', () => {
    const openExternal = vi.fn()
    const handler = createNavigationHandler({ env: DEV, openExternal })
    const event = { preventDefault: vi.fn() }

    handler(event, 'http://localhost:5173/project/1')

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(openExternal).not.toHaveBeenCalled()
  })
})
