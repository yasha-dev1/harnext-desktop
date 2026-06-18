import { describe, it, expect } from 'vitest'
import { orgFromToken, normalizeBaseUrl } from './context-engine-util'

// Build a fake JWT (header.payload.signature) with the given payload object.
const jwt = (payload: Record<string, unknown>): string => {
  const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`
}

describe('orgFromToken — granted project id from the access token (#111)', () => {
  it('reads the `org` claim', () => {
    expect(orgFromToken(jwt({ org: 'acme', scope: 'agent' }))).toBe('acme')
  })

  it('falls back to org_id then tenant', () => {
    expect(orgFromToken(jwt({ org_id: 'team-7' }))).toBe('team-7')
    expect(orgFromToken(jwt({ tenant: 'tnt-9' }))).toBe('tnt-9')
  })

  it('prefers org over the fallback claims', () => {
    expect(orgFromToken(jwt({ org: 'primary', org_id: 'secondary', tenant: 'third' }))).toBe(
      'primary'
    )
  })

  it('returns undefined when no org-like claim is present', () => {
    expect(orgFromToken(jwt({ scope: 'agent', sub: 'u1' }))).toBeUndefined()
  })

  it('returns undefined when the claim is non-string', () => {
    expect(orgFromToken(jwt({ org: 123 }))).toBeUndefined()
  })

  it('never throws on malformed input', () => {
    expect(orgFromToken('')).toBeUndefined()
    expect(orgFromToken('not-a-jwt')).toBeUndefined()
    expect(orgFromToken('a.!!!notbase64!!!.c')).toBeUndefined()
  })
})

describe('normalizeBaseUrl — configurable endpoint (#111)', () => {
  it('trims whitespace', () => {
    expect(normalizeBaseUrl('  https://app.harnext.dev/api  ')).toBe('https://app.harnext.dev/api')
  })

  it('strips one or more trailing slashes', () => {
    expect(normalizeBaseUrl('https://app.harnext.dev/api/')).toBe('https://app.harnext.dev/api')
    expect(normalizeBaseUrl('http://localhost:8000///')).toBe('http://localhost:8000')
  })

  it('leaves an already-clean URL unchanged', () => {
    expect(normalizeBaseUrl('https://app.harnext.dev/api')).toBe('https://app.harnext.dev/api')
  })
})
