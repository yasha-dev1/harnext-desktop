import { describe, it, expect } from 'vitest'
import { failureHeadline, cleanLog, isLongError, failureGuidance } from './failure'

// A realistic docker-compose failure: the cause buried under env-var warnings.
const COMPOSE_ERR = `WARN[0000] The "POSTGRES_PASSWORD" variable is not set. Defaulting to a blank string.
WARN[0000] The "REDIS_URL" variable is not set. Defaulting to a blank string.
WARN[0000] The "API_KEY" variable is not set. Defaulting to a blank string.
 Container redis-master  Creating
Error response from daemon: Conflict. The container name "/redis-master" is already in use by container "abc123".`

describe('failureHeadline (#118)', () => {
  it('pulls the real cause out from under the noise', () => {
    const h = failureHeadline(COMPOSE_ERR)
    expect(h).toContain('Conflict')
    expect(h).toContain('already in use')
    expect(h).not.toContain('variable is not set')
  })
  it('strips leading "Error:" decorations', () => {
    expect(failureHeadline('Error: something broke')).toBe('something broke')
  })
  it('falls back to a default on empty input', () => {
    expect(failureHeadline('   ')).toBe('The agent failed.')
  })
})

describe('cleanLog (#118)', () => {
  it('collapses the repeated "variable is not set" warnings', () => {
    const out = cleanLog(COMPOSE_ERR)
    expect(out).toContain('3 "variable is not set" warnings hidden')
    expect(out).toContain('Conflict')
    // The 3 raw warning lines are gone.
    expect(out.match(/Defaulting to a blank string/g)).toBeNull()
  })
})

describe('isLongError / failureGuidance', () => {
  it('flags multi-line or long errors', () => {
    expect(isLongError(COMPOSE_ERR)).toBe(true)
    expect(isLongError('nope')).toBe(false)
  })
  it('gives container-conflict guidance', () => {
    expect(failureGuidance(COMPOSE_ERR)).toMatch(/already running|remove the named container/i)
  })
  it('returns null for unknown errors', () => {
    expect(failureGuidance('some other failure')).toBeNull()
  })
})
