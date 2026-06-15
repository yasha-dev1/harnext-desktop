import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import type {
  McpLifecycle,
  McpScope,
  McpServerConfig,
  McpServerRow,
  McpTransport
} from '@shared/types'
import { Icon } from './icons'

// Mirrors core's isValidServerName (re-validated in the main process too).
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }): JSX.Element {
  return (
    <button className={'sw' + (on ? ' on' : '')} role="switch" aria-checked={on} onClick={onChange}>
      <span className="sw-knob" />
    </button>
  )
}

function parseKv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf('=')
    if (i > 0) {
      const k = line.slice(0, i).trim()
      if (k) out[k] = line.slice(i + 1).trim()
    }
  }
  return out
}

function AddForm({
  scope,
  cwd,
  existing,
  onDone,
  onCancel
}: {
  scope: McpScope
  cwd: string | null
  existing: string[]
  onDone: () => void
  onCancel: () => void
}): JSX.Element {
  const [name, setName] = useState('')
  const [transport, setTransport] = useState<McpTransport>('stdio')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [kv, setKv] = useState('')
  const [lifecycle, setLifecycle] = useState<McpLifecycle>('lazy')
  const [error, setError] = useState<string | null>(null)

  const submit = (): void => {
    const nm = name.trim()
    if (!NAME_RE.test(nm)) {
      setError('Name must be lowercase letters/digits/hyphens (e.g. my-server).')
      return
    }
    if (existing.includes(nm)) {
      setError(`A ${scope} server named “${nm}” already exists.`)
      return
    }
    const server: McpServerConfig = { lifecycle }
    if (transport === 'stdio') {
      if (!command.trim()) return setError('Command is required for a stdio server.')
      server.command = command.trim()
      const a = args.trim() ? args.trim().split(/\s+/) : []
      if (a.length) server.args = a
      const env = parseKv(kv)
      if (Object.keys(env).length) server.env = env
    } else {
      if (!url.trim()) return setError('URL is required.')
      server.url = url.trim()
      const headers = parseKv(kv)
      if (Object.keys(headers).length) server.headers = headers
    }
    void window.api.mcp
      .add(scope, nm, server, cwd)
      .then(onDone)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }

  return (
    <div className="mcp-form">
      <div className="mcp-form-grid">
        <label className="modal-field">
          <span>Name</span>
          <input value={name} placeholder="my-server" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="modal-field">
          <span>Transport</span>
          <span className="ctl-sel">
            <select
              value={transport}
              onChange={(e) => setTransport(e.target.value as McpTransport)}
            >
              <option value="stdio">stdio (command)</option>
              <option value="url">URL (SSE / HTTP)</option>
            </select>
          </span>
        </label>
      </div>

      {transport === 'stdio' ? (
        <>
          <label className="modal-field">
            <span>Command</span>
            <input value={command} placeholder="npx" onChange={(e) => setCommand(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>Arguments</span>
            <input
              value={args}
              placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
              onChange={(e) => setArgs(e.target.value)}
            />
          </label>
          <label className="modal-field">
            <span>Environment (KEY=value per line)</span>
            <textarea
              value={kv}
              rows={2}
              placeholder="API_KEY=…"
              onChange={(e) => setKv(e.target.value)}
            />
          </label>
        </>
      ) : (
        <>
          <label className="modal-field">
            <span>URL</span>
            <input
              value={url}
              placeholder="https://example.com/mcp"
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label className="modal-field">
            <span>Headers (KEY=value per line)</span>
            <textarea
              value={kv}
              rows={2}
              placeholder="Authorization=Bearer …"
              onChange={(e) => setKv(e.target.value)}
            />
          </label>
        </>
      )}

      <label className="modal-field">
        <span>Lifecycle</span>
        <span className="ctl-sel">
          <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value as McpLifecycle)}>
            <option value="lazy">lazy — start on first use</option>
            <option value="eager">eager — start with the session</option>
            <option value="keep-alive">keep-alive — stay running</option>
          </select>
        </span>
      </label>

      {error && <div className="mcp-err">{error}</div>}
      <div className="mcp-form-actions">
        <button className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" onClick={submit}>
          <Icon.plus size={14} />
          Add to {scope}
        </button>
      </div>
    </div>
  )
}

export default function McpSettings({ cwd }: { cwd: string | null }): JSX.Element {
  const [scope, setScope] = useState<McpScope>('user')
  const [rows, setRows] = useState<McpServerRow[]>([])
  const [adding, setAdding] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<McpServerRow | null>(null)

  const load = (): void => void window.api.mcp.list(cwd).then(setRows)
  useEffect(load, [cwd])

  const shown = useMemo(() => rows.filter((r) => r.scope === scope), [rows, scope])

  const toggle = (r: McpServerRow): void =>
    void window.api.mcp.setEnabled(r.scope, r.name, !r.enabled, cwd).then(load)
  const remove = (r: McpServerRow): void =>
    void window.api.mcp.remove(r.scope, r.name, cwd).then(() => {
      setConfirmRemove(null)
      load()
    })

  return (
    <div className="set-stack">
      <div className="set-card">
        <div className="set-card-head">
          <Icon.cube size={15} />
          <h3>MCP servers</h3>
          <div className="mcp-scope">
            <button className={scope === 'user' ? 'on' : ''} onClick={() => setScope('user')}>
              User
            </button>
            <button
              className={scope === 'project' ? 'on' : ''}
              disabled={!cwd}
              title={cwd ? '' : 'Open a project to manage project-scoped servers'}
              onClick={() => setScope('project')}
            >
              Project
            </button>
          </div>
        </div>
        <p className="mcp-desc">
          Tools available to agents.{' '}
          {scope === 'user'
            ? 'User servers apply to every project.'
            : 'Project servers apply to this project and override user servers of the same name.'}{' '}
          Changes take effect on the next agent session.
        </p>

        {shown.length === 0 && !adding && (
          <div className="mcp-empty">No {scope} MCP servers yet — add one below.</div>
        )}

        {shown.map((r) => (
          <div className={'mcp-row' + (r.enabled ? '' : ' off')} key={r.scope + ':' + r.name}>
            <Toggle on={r.enabled} onChange={() => toggle(r)} />
            <div className="mcp-row-main">
              <div className="mcp-row-top">
                <b>{r.name}</b>
                <span className="mcp-badge">{r.transport}</span>
                {!r.enabled && <span className="mcp-badge off">disabled</span>}
              </div>
              <div className="mcp-row-sub">
                {r.transport === 'url'
                  ? r.config.url
                  : [r.config.command, ...(r.config.args ?? [])].join(' ')}
              </div>
            </div>
            <button className="mcp-del" title="Remove server" onClick={() => setConfirmRemove(r)}>
              <Icon.trash size={14} />
            </button>
          </div>
        ))}

        {adding ? (
          <AddForm
            scope={scope}
            cwd={cwd}
            existing={shown.map((r) => r.name)}
            onDone={() => {
              setAdding(false)
              load()
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button className="btn" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>
            <Icon.plus size={14} />
            Add server
          </button>
        )}
      </div>

      <div className="set-card">
        <div className="set-card-head">
          <Icon.spark size={15} />
          <h3>Built-in servers</h3>
        </div>
        <p className="mcp-desc">
          Browser verification and the Context Engine are provided by their own features and will
          appear here, with an activation control, when available.
        </p>
      </div>

      {confirmRemove && (
        <div className="modal-backdrop" onClick={() => setConfirmRemove(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <Icon.trash size={15} />
              Remove “{confirmRemove.name}”?
            </div>
            <p className="modal-desc">
              Deletes the server from your <b>{confirmRemove.scope}</b> MCP config.
            </p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirmRemove(null)}>
                Cancel
              </button>
              <button className="btn danger" onClick={() => remove(confirmRemove)}>
                <Icon.trash size={14} />
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
