import { describe, it, expect } from 'vitest'
import { buildEnvFileContent, parseEnvFile } from './env-file'

describe('parseEnvFile', () => {
  it('parses KEY=value, skipping blanks and comments', () => {
    const out = parseEnvFile('# comment\n\nFOO=bar\nBAZ=qux\n')
    expect(out).toEqual({ FOO: 'bar', BAZ: 'qux' })
  })

  it('strips a leading `export ` and surrounding matching quotes', () => {
    const out = parseEnvFile(`export A=1\nB="two words"\nC='single'\nD="unbalanced`)
    expect(out).toEqual({ A: '1', B: 'two words', C: 'single', D: '"unbalanced' })
  })

  it('keeps everything after the first = (values may contain =)', () => {
    expect(parseEnvFile('TOKEN=a=b=c')).toEqual({ TOKEN: 'a=b=c' })
  })

  it('ignores malformed lines with no key', () => {
    expect(parseEnvFile('=novalue\nVALID=ok')).toEqual({ VALID: 'ok' })
  })
})

describe('buildEnvFileContent', () => {
  it('returns empty when there is no base and no secrets', () => {
    expect(buildEnvFileContent(null, {})).toBe('')
  })

  it('passes a base file through, ensuring a trailing newline', () => {
    expect(buildEnvFileContent('FOO=bar', {})).toBe('FOO=bar\n')
  })

  it('appends secret lines AFTER the base so duplicates resolve to the secret', () => {
    const out = buildEnvFileContent('FOO=base\n', { FOO: 'secret', NEW: 'x' })
    expect(out).toBe('FOO=base\nFOO=secret\nNEW=x\n')
    // last definition wins in compose's dotenv loader
    expect(out.lastIndexOf('FOO=secret')).toBeGreaterThan(out.indexOf('FOO=base'))
  })

  it('emits secrets-only content when there is no base file', () => {
    expect(buildEnvFileContent(null, { S3_KEY: 'abc' })).toBe('S3_KEY=abc\n')
  })
})
