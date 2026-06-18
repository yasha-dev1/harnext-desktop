import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Mock the two native/electron-bound deps so the pure secret logic is testable
// off the Electron runtime (the boundary #176 flags). `encryptString` returns a
// Buffer the app base64-encodes; the round-trip below is faithful to that.
// vi.hoisted so the mock state exists when the (hoisted) vi.mock factories run.
const { enc, db } = vi.hoisted(() => ({
  enc: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from('enc:' + s, 'utf8')),
    decryptString: vi.fn((b: Buffer) => {
      const s = b.toString('utf8')
      if (!s.startsWith('enc:')) throw new Error('not decryptable')
      return s.slice('enc:'.length)
    })
  },
  db: {
    listSecretRows: vi.fn((): { key: string; value_enc: string }[] => []),
    upsertSecret: vi.fn(),
    deleteSecret: vi.fn()
  }
}))
vi.mock('electron', () => ({ safeStorage: enc }))
vi.mock('../db', () => db)

import {
  secretsAvailable,
  setProjectSecret,
  listProjectSecretKeys,
  removeProjectSecret,
  resolveProjectSecrets,
  setProjectSecretsFromText,
  importSecretsFromEnvFile
} from './secrets'

beforeEach(() => {
  vi.clearAllMocks()
  enc.isEncryptionAvailable.mockReturnValue(true)
  enc.encryptString.mockImplementation((s: string) => Buffer.from('enc:' + s, 'utf8'))
  enc.decryptString.mockImplementation((b: Buffer) => {
    const s = b.toString('utf8')
    if (!s.startsWith('enc:')) throw new Error('not decryptable')
    return s.slice('enc:'.length)
  })
  db.listSecretRows.mockReturnValue([])
})

describe('secretsAvailable', () => {
  it('reflects the keychain availability', () => {
    enc.isEncryptionAvailable.mockReturnValue(true)
    expect(secretsAvailable()).toBe(true)
    enc.isEncryptionAvailable.mockReturnValue(false)
    expect(secretsAvailable()).toBe(false)
  })

  it('returns false (never throws) when the keychain probe throws', () => {
    enc.isEncryptionAvailable.mockImplementation(() => {
      throw new Error('no keychain')
    })
    expect(secretsAvailable()).toBe(false)
  })
})

describe('setProjectSecret', () => {
  it('encrypts the value and stores it base64-encoded under the trimmed key', () => {
    setProjectSecret(7, '  API_KEY  ', 'sk-123')
    expect(db.upsertSecret).toHaveBeenCalledTimes(1)
    const [projectId, key, valueEnc] = db.upsertSecret.mock.calls[0]
    expect(projectId).toBe(7)
    expect(key).toBe('API_KEY')
    // The stored blob is base64 of the encrypted buffer; decode → decrypt → plaintext.
    expect(enc.decryptString(Buffer.from(valueEnc, 'base64'))).toBe('sk-123')
  })

  it('rejects an empty/whitespace key', () => {
    expect(() => setProjectSecret(1, '   ', 'v')).toThrow(/name is required/i)
    expect(db.upsertSecret).not.toHaveBeenCalled()
  })

  it('rejects a value containing a newline (would corrupt the env-file)', () => {
    expect(() => setProjectSecret(1, 'K', 'line1\nline2')).toThrow(/newline/i)
    expect(() => setProjectSecret(1, 'K', 'line1\r\nline2')).toThrow(/newline/i)
    expect(db.upsertSecret).not.toHaveBeenCalled()
  })

  it('refuses to store when the keychain is unavailable (never plaintext)', () => {
    enc.isEncryptionAvailable.mockReturnValue(false)
    expect(() => setProjectSecret(1, 'K', 'v')).toThrow(/keychain is unavailable/i)
    expect(db.upsertSecret).not.toHaveBeenCalled()
  })
})

describe('listProjectSecretKeys', () => {
  it('returns only the names (never the encrypted values)', () => {
    db.listSecretRows.mockReturnValue([
      { key: 'A', value_enc: 'xxx' },
      { key: 'B', value_enc: 'yyy' }
    ])
    expect(listProjectSecretKeys(3)).toEqual(['A', 'B'])
    expect(db.listSecretRows).toHaveBeenCalledWith(3)
  })
})

describe('removeProjectSecret', () => {
  it('deletes the secret by key', () => {
    removeProjectSecret(4, 'GONE')
    expect(db.deleteSecret).toHaveBeenCalledWith(4, 'GONE')
  })
})

describe('resolveProjectSecrets', () => {
  it('decrypts every stored secret into a plain map', () => {
    db.listSecretRows.mockReturnValue([
      { key: 'A', value_enc: Buffer.from('enc:1', 'utf8').toString('base64') },
      { key: 'B', value_enc: Buffer.from('enc:2', 'utf8').toString('base64') }
    ])
    expect(resolveProjectSecrets(1)).toEqual({ A: '1', B: '2' })
  })

  it('skips a secret that can no longer be decrypted (rotated keychain / other OS)', () => {
    db.listSecretRows.mockReturnValue([
      { key: 'GOOD', value_enc: Buffer.from('enc:ok', 'utf8').toString('base64') },
      { key: 'BAD', value_enc: Buffer.from('garbage', 'utf8').toString('base64') }
    ])
    expect(resolveProjectSecrets(1)).toEqual({ GOOD: 'ok' })
  })
})

describe('setProjectSecretsFromText', () => {
  it('parses an env blob and stores each pair encrypted', () => {
    const stored: string[] = []
    db.upsertSecret.mockImplementation((_p: number, k: string) => stored.push(k))
    db.listSecretRows.mockImplementation(() => stored.map((k) => ({ key: k, value_enc: 'x' })))
    const res = setProjectSecretsFromText(2, 'export A=1\n# comment\nB="two"\n\n')
    expect(res.imported).toBe(2)
    expect(res.keys).toEqual(['A', 'B'])
    expect(db.upsertSecret).toHaveBeenCalledTimes(2)
  })
})

describe('importSecretsFromEnvFile', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'secrets-test-'))
  })

  it('reads KEY=value pairs from a file (relative path resolved against the project)', () => {
    writeFileSync(join(dir, '.env'), 'TOKEN=abc\nDEBUG=1\n')
    const stored: string[] = []
    db.upsertSecret.mockImplementation((_p: number, k: string) => stored.push(k))
    db.listSecretRows.mockImplementation(() => stored.map((k) => ({ key: k, value_enc: 'x' })))
    const res = importSecretsFromEnvFile(9, dir, '.env')
    expect(res.imported).toBe(2)
    expect([...res.keys].sort()).toEqual(['DEBUG', 'TOKEN'])
    rmSync(dir, { recursive: true, force: true })
  })

  it('throws a clear error when the env-file is missing', () => {
    expect(() => importSecretsFromEnvFile(9, dir, 'nope.env')).toThrow(/No env-file found/)
    rmSync(dir, { recursive: true, force: true })
  })
})
