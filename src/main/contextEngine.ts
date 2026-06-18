import { shell } from 'electron'
import {
  CloudAuthError,
  clearCloudTokens,
  discoverClientId,
  loadCloudTokens,
  pollForToken,
  requestDeviceCode,
  saveCloudTokens
} from '@harnext/core'
import * as db from './db'
import { normalizeBaseUrl, orgFromToken } from './context-engine-util'
import type { ContextEngineStatus } from '../shared/types'

// Drives the Harnext Context Engine sign-in. The OAuth 2.0 Device Authorization
// Grant (RFC 8628) client lives in @harnext/core — the same code path the
// `harnext` CLI uses — so the desktop and CLI share one token store
// (~/.harnext/agent/context-engine.json, 0600). Here we only translate the
// flow into renderer-facing status events. Default endpoint is the hosted
// engine at app.harnext.dev (see db.SETTINGS_DEFAULTS.contextEngineUrl).

let emit: (s: ContextEngineStatus) => void = () => {}
export function setContextEngineEmit(fn: (s: ContextEngineStatus) => void): void {
  emit = fn
}

let abort: AbortController | null = null

function baseUrl(): string {
  return db.getSettings().contextEngineUrl
}

export function getContextEngineStatus(): ContextEngineStatus {
  const tokens = loadCloudTokens()
  if (tokens) {
    return {
      baseUrl: baseUrl(),
      connected: true,
      endpoint: tokens.endpoint,
      orgId: orgFromToken(tokens.accessToken),
      phase: 'connected'
    }
  }
  return { baseUrl: baseUrl(), connected: false, phase: 'idle' }
}

export async function startContextEngineLogin(): Promise<void> {
  abort?.abort()
  abort = new AbortController()
  const endpoint = baseUrl()
  try {
    const clientId = await discoverClientId(endpoint)
    const code = await requestDeviceCode(endpoint, clientId)
    emit({
      baseUrl: endpoint,
      connected: false,
      phase: 'pending',
      userCode: code.user_code,
      verificationUri: code.verification_uri_complete
    })
    // Open whatever approval URL the engine returned (don't hard-code the host).
    void shell.openExternal(code.verification_uri_complete)

    const token = await pollForToken(endpoint, clientId, code.device_code, {
      intervalSeconds: code.interval,
      expiresInSeconds: code.expires_in,
      signal: abort.signal
    })
    saveCloudTokens({
      endpoint,
      clientId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      accessExpiresAt: Date.now() + token.expires_in * 1000
    })
    emit(getContextEngineStatus())
  } catch (err) {
    if (abort?.signal.aborted) {
      emit(getContextEngineStatus())
      return
    }
    const message =
      err instanceof CloudAuthError
        ? (err.code ?? err.message)
        : err instanceof Error
          ? err.message
          : String(err)
    emit({ baseUrl: endpoint, connected: false, phase: 'error', error: message })
  } finally {
    abort = null
  }
}

export function cancelContextEngineLogin(): void {
  abort?.abort()
  abort = null
  emit(getContextEngineStatus())
}

export function disconnectContextEngine(): void {
  abort?.abort()
  abort = null
  clearCloudTokens()
  emit(getContextEngineStatus())
}

export function setContextEngineBaseUrl(url: string): ContextEngineStatus {
  db.setSettings({ contextEngineUrl: normalizeBaseUrl(url) })
  return getContextEngineStatus()
}
