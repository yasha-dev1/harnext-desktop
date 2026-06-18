import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ContextEngineStatus } from '../shared/types'

// Mock the electron / @harnext/core / db / util boundary so the device-flow
// orchestration is testable off Electron + the network (#138). The pure helpers
// (normalizeBaseUrl/orgFromToken) have their own tests, so they're mocked here.
const core = vi.hoisted(() => {
  class CloudAuthError extends Error {
    code?: string
    constructor(message: string, code?: string) {
      super(message)
      this.code = code
    }
  }
  return {
    CloudAuthError,
    clearCloudTokens: vi.fn(),
    discoverClientId: vi.fn(),
    loadCloudTokens: vi.fn<() => { endpoint: string; accessToken: string } | null>(),
    pollForToken: vi.fn(),
    requestDeviceCode: vi.fn(),
    saveCloudTokens: vi.fn()
  }
})
vi.mock('@harnext/core', () => core)

const shell = vi.hoisted(() => ({ openExternal: vi.fn() }))
vi.mock('electron', () => ({ shell }))

const db = vi.hoisted(() => ({
  getSettings: vi.fn(() => ({ contextEngineUrl: 'https://app.harnext.dev' })),
  setSettings: vi.fn()
}))
vi.mock('./db', () => db)

const util = vi.hoisted(() => ({
  normalizeBaseUrl: vi.fn((u: string) => u),
  orgFromToken: vi.fn(() => 'org-1')
}))
vi.mock('./context-engine-util', () => util)

import {
  setContextEngineEmit,
  getContextEngineStatus,
  startContextEngineLogin,
  cancelContextEngineLogin,
  disconnectContextEngine,
  setContextEngineBaseUrl
} from './contextEngine'

const DEVICE_CODE = {
  user_code: 'WXYZ-1234',
  verification_uri_complete: 'https://app.harnext.dev/device?code=WXYZ',
  device_code: 'dev-code',
  interval: 5,
  expires_in: 600
}
const TOKEN = { access_token: 'at', refresh_token: 'rt', expires_in: 3600 }

let emit: ReturnType<typeof vi.fn<(s: ContextEngineStatus) => void>>
beforeEach(() => {
  vi.clearAllMocks()
  db.getSettings.mockReturnValue({ contextEngineUrl: 'https://app.harnext.dev' })
  util.normalizeBaseUrl.mockImplementation((u: string) => u)
  util.orgFromToken.mockReturnValue('org-1')
  core.loadCloudTokens.mockReturnValue(null)
  emit = vi.fn<(s: ContextEngineStatus) => void>()
  setContextEngineEmit(emit)
})

describe('getContextEngineStatus', () => {
  it('reports connected with the org decoded from the token when signed in', () => {
    core.loadCloudTokens.mockReturnValue({ endpoint: 'https://app.harnext.dev', accessToken: 'at' })
    expect(getContextEngineStatus()).toEqual({
      baseUrl: 'https://app.harnext.dev',
      connected: true,
      endpoint: 'https://app.harnext.dev',
      orgId: 'org-1',
      phase: 'connected'
    })
  })

  it('reports idle when there are no stored tokens', () => {
    core.loadCloudTokens.mockReturnValue(null)
    expect(getContextEngineStatus()).toEqual({
      baseUrl: 'https://app.harnext.dev',
      connected: false,
      phase: 'idle'
    })
  })
})

describe('setContextEngineBaseUrl', () => {
  it('normalizes and persists the URL, then returns the fresh status', () => {
    util.normalizeBaseUrl.mockReturnValue('https://normalized.dev')
    db.getSettings.mockReturnValue({ contextEngineUrl: 'https://normalized.dev' })
    const status = setContextEngineBaseUrl('  https://normalized.dev/  ')
    expect(db.setSettings).toHaveBeenCalledWith({ contextEngineUrl: 'https://normalized.dev' })
    expect(status.baseUrl).toBe('https://normalized.dev')
  })
})

describe('disconnectContextEngine', () => {
  it('clears the stored tokens and emits the idle status', () => {
    disconnectContextEngine()
    expect(core.clearCloudTokens).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ connected: false, phase: 'idle' }))
  })
})

describe('cancelContextEngineLogin', () => {
  it('emits the current status (back to idle) on cancel', () => {
    cancelContextEngineLogin()
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ phase: 'idle' }))
  })
})

describe('startContextEngineLogin — device flow', () => {
  it('emits pending, opens the approval URL, stores the token, and emits connected', async () => {
    core.discoverClientId.mockResolvedValue('client-1')
    core.requestDeviceCode.mockResolvedValue(DEVICE_CODE)
    core.pollForToken.mockResolvedValue(TOKEN)
    core.loadCloudTokens.mockReturnValue({ endpoint: 'https://app.harnext.dev', accessToken: 'at' })

    await startContextEngineLogin()

    // 1) a pending status carrying the user code + approval URL
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'pending',
        userCode: 'WXYZ-1234',
        verificationUri: DEVICE_CODE.verification_uri_complete
      })
    )
    // 2) the approval page is opened in the system browser
    expect(shell.openExternal).toHaveBeenCalledWith(DEVICE_CODE.verification_uri_complete)
    // 3) the granted token is persisted (shared with the CLI store)
    expect(core.saveCloudTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://app.harnext.dev',
        clientId: 'client-1',
        accessToken: 'at',
        refreshToken: 'rt'
      })
    )
    // 4) a final connected status
    expect(emit).toHaveBeenLastCalledWith(
      expect.objectContaining({ connected: true, phase: 'connected' })
    )
  })

  it('emits an error with the CloudAuthError code when approval fails', async () => {
    core.discoverClientId.mockResolvedValue('client-1')
    core.requestDeviceCode.mockResolvedValue(DEVICE_CODE)
    core.pollForToken.mockRejectedValue(new core.CloudAuthError('denied', 'access_denied'))

    await startContextEngineLogin()

    expect(core.saveCloudTokens).not.toHaveBeenCalled()
    expect(emit).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'error', error: 'access_denied' })
    )
  })

  it('surfaces a generic error message when discovery throws a plain error', async () => {
    core.discoverClientId.mockRejectedValue(new Error('network down'))
    await startContextEngineLogin()
    expect(emit).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'error', error: 'network down' })
    )
  })
})
