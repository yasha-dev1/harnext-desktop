import { describe, it, expect } from 'vitest'
import { describeAgentError, extractStatus } from './error-messages'

const CTX = { provider: 'nvidia', model: 'deepseek/deepseek-v4-pro' }

describe('extractStatus', () => {
  it('reads a numeric status off the error object', () => {
    expect(extractStatus({ status: 404 })).toBe(404)
    expect(extractStatus({ statusCode: 429 })).toBe(429)
    expect(extractStatus({ response: { status: 503 } })).toBe(503)
  })

  it('parses a 4xx/5xx status out of the message text', () => {
    expect(extractStatus(new Error('404 404 page not found'))).toBe(404)
    expect(extractStatus('HTTP 429 Too Many Requests')).toBe(429)
    expect(extractStatus('status 500 internal error')).toBe(500)
  })

  it('returns null when there is no status', () => {
    expect(extractStatus(new Error('something went wrong'))).toBeNull()
    expect(extractStatus('the year 2026 was fine')).toBeNull() // not a 4xx/5xx
    expect(extractStatus(null)).toBeNull()
  })
})

describe('describeAgentError — actionable model/provider messages (#129)', () => {
  it('maps the real repro (404 page not found) to a model-not-found message', () => {
    const msg = describeAgentError(new Error('404 404 page not found'), CTX)
    expect(msg).toBe(
      'Model "deepseek/deepseek-v4-pro" not found on provider "nvidia". Check the model in Settings → Models.'
    )
    expect(msg).not.toContain('page not found')
  })

  it('maps an unknown-model error without a status code', () => {
    expect(describeAgentError(new Error('unknown model requested'), CTX)).toMatch(
      /not found on provider/
    )
  })

  it('maps 401/403 to an API-key message', () => {
    expect(describeAgentError({ status: 401 }, CTX)).toBe(
      'Invalid or expired API key for nvidia. Update it in Settings → Providers.'
    )
    expect(describeAgentError(new Error('403 Forbidden'), CTX)).toMatch(/API key for nvidia/)
    expect(describeAgentError(new Error('Invalid API key'), CTX)).toMatch(/API key/)
  })

  it('maps 429 / rate-limit wording', () => {
    expect(describeAgentError({ status: 429 }, CTX)).toBe(
      'Rate limited by nvidia — try again shortly.'
    )
    expect(describeAgentError(new Error('rate limit exceeded'), CTX)).toMatch(/Rate limited/)
  })

  it('maps connectivity errors to a reachability message', () => {
    expect(describeAgentError(new Error('fetch failed: ECONNREFUSED'), CTX)).toBe(
      "Couldn't reach nvidia. Check your connection or base URL."
    )
    expect(describeAgentError(new Error('getaddrinfo ENOTFOUND api.x'), CTX)).toMatch(
      /Couldn't reach/
    )
    expect(describeAgentError(new Error('request timed out'), CTX)).toMatch(/Couldn't reach/)
  })

  it('maps 5xx to an upstream server-error message', () => {
    expect(describeAgentError({ status: 503 }, CTX)).toBe(
      'Nvidia had a server error (503) — try again shortly.'
    )
  })

  it('keeps the raw detail when nothing matches (no detail is lost)', () => {
    expect(describeAgentError(new Error('weird custom failure'), CTX)).toBe('weird custom failure')
  })

  it('degrades gracefully with no context', () => {
    expect(describeAgentError(new Error('404 not found'))).toContain('the provider')
    expect(describeAgentError(new Error('404 not found'))).toContain('the selected model')
  })

  it('ignores a blank model id', () => {
    const msg = describeAgentError(new Error('404'), { provider: 'openai', model: '  ' })
    expect(msg).toContain('the selected model')
    expect(msg).toContain('"openai"')
  })
})
