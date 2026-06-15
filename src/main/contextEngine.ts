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
import type { ContextEngineStatus } from '../shared/types'

// Core's CloudTokens vault (0600 file with a long-lived refresh token) handles
// secure storage; here we just drive the RFC 8628 device flow with core's
// client and translate it into renderer-facing status events.

let emit: (s: ContextEngineStatus) => void = () => {}
export function setContextEngineEmit(fn: (s: ContextEngineStatus) => void): void {
  emit = fn
}

let abort: AbortController | null = null

function baseUrl(): string {
  return db.getSettings().contextEngineUrl
}

/** Best-effort org/project id from the access token's JWT payload. */
function orgFromToken(accessToken: string): string | undefined {
  try {
    const payload = accessToken.split('.')[1]
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
    const org = json.org_id ?? json.org ?? json.tenant ?? json.sub
    return typeof org === 'string' ? org : undefined
  } catch {
    return undefined
  }
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
  db.setSettings({ contextEngineUrl: url.trim().replace(/\/+$/, '') })
  return getContextEngineStatus()
}
