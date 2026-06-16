import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { safeStorage } from 'electron'
import * as db from '../db'
import { parseEnvFile } from './env-file'

/**
 * Per-project secret store (#123). Values are encrypted at rest with Electron's
 * `safeStorage` (OS keychain) and decrypted only here, in the main process — they
 * never reach the renderer and are never written into a git worktree. The sandbox
 * feeds them to compose via a temp `--env-file` (see env/sandbox.ts).
 */

/** Whether the OS keychain can encrypt — if not, storing secrets is refused. */
export function secretsAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encrypt(value: string): string {
  return safeStorage.encryptString(value).toString('base64')
}

function decrypt(valueEnc: string): string {
  return safeStorage.decryptString(Buffer.from(valueEnc, 'base64'))
}

/** Stored secret names (never values), sorted — safe to send to the renderer. */
export function listProjectSecretKeys(projectId: number): string[] {
  return db.listSecretRows(projectId).map((r) => r.key)
}

/**
 * Encrypt and store one secret. Throws when the keychain is unavailable (so we
 * never silently fall back to plaintext) or the value spans multiple lines (an
 * env-file is line-oriented; a stray newline would corrupt later entries).
 */
export function setProjectSecret(projectId: number, key: string, value: string): void {
  const k = key.trim()
  if (!k) throw new Error('Secret name is required.')
  if (/[\r\n]/.test(value)) throw new Error(`Secret "${k}" must not contain a newline.`)
  if (!secretsAvailable()) {
    throw new Error('OS keychain is unavailable, so secrets cannot be stored securely.')
  }
  db.upsertSecret(projectId, k, encrypt(value))
}

export function removeProjectSecret(projectId: number, key: string): void {
  db.deleteSecret(projectId, key)
}

/** Decrypt every stored secret — main-process only, used at sandbox bootstrap. */
export function resolveProjectSecrets(projectId: number): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of db.listSecretRows(projectId)) {
    try {
      out[r.key] = decrypt(r.value_enc)
    } catch {
      /* skip a secret we can no longer decrypt (keychain rotated / different OS) */
    }
  }
  return out
}

/**
 * Parse env-file text (a pasted blob or a file's contents) into KEY=value pairs
 * and store them encrypted. Returns how many were imported and the resulting key
 * list. Parsing/encryption happen in the main process; values never leave it.
 */
export function setProjectSecretsFromText(
  projectId: number,
  text: string
): { imported: number; keys: string[] } {
  const parsed = parseEnvFile(text)
  for (const [k, v] of Object.entries(parsed)) setProjectSecret(projectId, k, v)
  return { imported: Object.keys(parsed).length, keys: listProjectSecretKeys(projectId) }
}

/** Import KEY=value pairs from an env-file on disk. */
export function importSecretsFromEnvFile(
  projectId: number,
  projectPath: string,
  envFile: string
): { imported: number; keys: string[] } {
  const path = isAbsolute(envFile) ? envFile : resolve(projectPath, envFile)
  if (!existsSync(path)) throw new Error(`No env-file found at ${path}`)
  return setProjectSecretsFromText(projectId, readFileSync(path, 'utf8'))
}
