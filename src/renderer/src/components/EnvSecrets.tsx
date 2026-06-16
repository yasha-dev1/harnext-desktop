import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { EnvOverrides, Project, ProjectSecretsInfo } from '@shared/types'
import { Icon } from './icons'

/**
 * Per-project environment & secrets editor (#123). The sandbox feeds these to
 * compose via `--env-file`, so apps that validate config (e.g. missing S3 keys)
 * can boot. Secret VALUES never come back over IPC — only names — and the add
 * form / import write straight to the encrypted store in the main process.
 */
export default function EnvSecrets({
  project,
  setOverrides
}: {
  project: Project
  setOverrides: (patch: EnvOverrides) => Promise<void>
}): JSX.Element {
  const [info, setInfo] = useState<ProjectSecretsInfo>({ available: true, keys: [] })
  const [mode, setMode] = useState<'none' | 'single' | 'bulk'>('none')
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [bulk, setBulk] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = (): void => void window.api.projects.secrets(project.id).then(setInfo)
  useEffect(load, [project.id])

  const reset = (): void => {
    setMode('none')
    setKey('')
    setValue('')
    setBulk('')
    setError(null)
  }
  const open = (m: 'single' | 'bulk'): void => {
    setError(null)
    setMode(m)
  }
  const guard = async (fn: () => Promise<ProjectSecretsInfo>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      setInfo(await fn())
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  const add = async (): Promise<void> => {
    const k = key.trim()
    if (!k) return setError('Secret name is required.')
    if (await guard(() => window.api.projects.setSecret(project.id, k, value))) reset()
  }
  const addBulk = async (): Promise<void> => {
    if (!bulk.trim()) return setError('Paste one KEY=value pair per line.')
    if (await guard(() => window.api.projects.setSecretsBulk(project.id, bulk))) reset()
  }
  const remove = (k: string): Promise<boolean> =>
    guard(() => window.api.projects.removeSecret(project.id, k))
  const importEnv = (): Promise<boolean> =>
    guard(() => window.api.projects.importSecretsFromEnv(project.id))

  const envFile = project.envConfig?.overrides?.envFile ?? ''

  return (
    <div className="set-card">
      <div className="set-card-head">
        <Icon.key size={15} />
        <h3>Environment &amp; secrets</h3>
        <span className="hint">interpolated into the sandbox · encrypted at rest</span>
      </div>

      <div className="set-row col">
        <div className="set-rl">
          <div className="set-label">Env file</div>
          <div className="set-desc">
            Path to an env-file the sandbox feeds compose, so <code>${'{VAR}'}</code> resolves.
            Relative to the project root. Leave blank to use <code>.env</code> in the main checkout
            when present. Read from the main checkout — never the worktree.
          </div>
        </div>
        <div className="set-rc">
          <EnvFileField value={envFile} onSave={(v) => void setOverrides({ envFile: v })} />
        </div>
      </div>

      {!info.available && (
        <div className="prov-warn">
          <Icon.alert size={15} />
          <div>
            The OS keychain is unavailable, so secrets can&apos;t be stored securely here. Use the
            env-file above instead.
          </div>
        </div>
      )}

      {info.keys.length === 0 && mode === 'none' && (
        <div className="mcp-empty">No stored secrets — add one or import from a .env below.</div>
      )}

      {info.keys.map((k) => (
        <div className="mcp-row" key={k}>
          <div className="mcp-row-main">
            <div className="mcp-row-top">
              <b>{k}</b>
              <span className="mcp-badge">secret</span>
            </div>
            <div className="mcp-row-sub">••••••••</div>
          </div>
          <button
            className="mcp-del"
            title="Remove secret"
            disabled={busy}
            onClick={() => void remove(k)}
          >
            <Icon.trash size={14} />
          </button>
        </div>
      ))}

      {mode === 'single' && (
        <div className="mcp-form">
          <div className="mcp-form-grid">
            <label className="modal-field">
              <span>Name</span>
              <input
                value={key}
                placeholder="S3_ACCESS_KEY"
                spellCheck={false}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <label className="modal-field">
              <span>Value</span>
              <input
                value={value}
                type="password"
                spellCheck={false}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) void add()
                }}
              />
            </label>
          </div>
          {error && <div className="mcp-err">{error}</div>}
          <div className="mcp-form-actions">
            <button className="btn ghost" onClick={reset}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy} onClick={() => void add()}>
              <Icon.plus size={14} />
              Add secret
            </button>
          </div>
        </div>
      )}

      {mode === 'bulk' && (
        <div className="mcp-form">
          <label className="modal-field">
            <span>Paste .env (KEY=value per line)</span>
            <textarea
              value={bulk}
              rows={6}
              spellCheck={false}
              placeholder={'S3_ACCESS_KEY=AKIA…\nS3_SECRET_KEY=…\nDATABASE_URL=postgres://…'}
              onChange={(e) => setBulk(e.target.value)}
            />
          </label>
          {error && <div className="mcp-err">{error}</div>}
          <div className="mcp-form-actions">
            <button className="btn ghost" onClick={reset}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy} onClick={() => void addBulk()}>
              <Icon.plus size={14} />
              Add all
            </button>
          </div>
        </div>
      )}

      {mode === 'none' && (
        <div className="mcp-form-actions" style={{ padding: '12px 14px 14px' }}>
          {error && <div className="mcp-err">{error}</div>}
          <span className="spacer" />
          <button
            className="btn ghost"
            disabled={busy || !info.available}
            title="Import KEY=value pairs from .env in the project root"
            onClick={() => void importEnv()}
          >
            <Icon.file size={14} />
            Import from .env
          </button>
          <button className="btn ghost" disabled={!info.available} onClick={() => open('bulk')}>
            <Icon.file size={14} />
            Paste .env
          </button>
          <button className="btn" disabled={!info.available} onClick={() => open('single')}>
            <Icon.plus size={14} />
            Add secret
          </button>
        </div>
      )}
    </div>
  )
}

/** Env-file path input with a file picker (mirrors Settings' PathField). */
function EnvFileField({
  value,
  onSave
}: {
  value: string
  onSave: (v: string) => void
}): JSX.Element {
  const [v, setV] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setV(value)
  }
  // Commit on blur/Enter; an empty value clears the override (back to .env default).
  const commit = (next: string): void => {
    if (next.trim() !== value) onSave(next.trim())
  }
  const browse = async (): Promise<void> => {
    const file = await window.api.pickEnvFile()
    if (file) {
      setV(file)
      onSave(file)
    }
  }
  return (
    <span className="path-field">
      <span className="field">
        <span className="field-ic">
          <Icon.file size={15} />
        </span>
        <input
          type="text"
          spellCheck={false}
          value={v}
          placeholder=".env"
          onChange={(e) => setV(e.target.value)}
          onBlur={() => commit(v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit(v)
          }}
        />
      </span>
      <button className="btn ghost" onClick={() => void browse()}>
        Browse
      </button>
    </span>
  )
}
