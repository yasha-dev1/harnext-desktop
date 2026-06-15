import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { Icon } from '../components/icons'

export default function ContextEngine(): JSX.Element {
  const ce = useAppStore((s) => s.contextEngine)
  const load = useAppStore((s) => s.loadContextEngine)
  const startLogin = useAppStore((s) => s.startContextEngineLogin)
  const cancelLogin = useAppStore((s) => s.cancelContextEngineLogin)
  const disconnect = useAppStore((s) => s.disconnectContextEngine)
  const setUrl = useAppStore((s) => s.setContextEngineUrl)

  const [urlDraft, setUrlDraft] = useState('')
  // Seed the URL field once the status loads (adjust-on-render).
  const [lastUrl, setLastUrl] = useState<string | null>(null)
  if (ce && ce.baseUrl !== lastUrl) {
    setLastUrl(ce.baseUrl)
    setUrlDraft(ce.baseUrl)
  }

  useEffect(() => {
    void load()
  }, [load])

  const phase = ce?.phase ?? 'idle'
  const editingDisabled = phase === 'pending' || phase === 'connected'

  return (
    <div className="compose-wrap">
      <div className="compose view" style={{ width: 'min(720px, 100%)' }}>
        <div className="compose-eyebrow">
          <span className="dot" />
          Context Engine
        </div>
        <h1>Connect to the Harnext Context Engine</h1>
        <p className="lead">
          Give your coding agents knowledge of your whole organization — the events and context the
          Harnext Context Engine maintains. Sign in with the device flow; the engine binds the grant
          to a project you pick in the browser.
        </p>

        <div className="set-card">
          <div className="set-card-head">
            <Icon.external size={15} />
            <h3>Engine</h3>
          </div>
          <label className="modal-field" style={{ padding: '14px 18px' }}>
            <span>Ingest API base URL</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <input
                value={urlDraft}
                disabled={editingDisabled}
                placeholder="https://engine.harnext.com"
                onChange={(e) => setUrlDraft(e.target.value)}
              />
              <button
                className="btn"
                disabled={editingDisabled || !urlDraft.trim() || urlDraft.trim() === ce?.baseUrl}
                onClick={() => void setUrl(urlDraft)}
              >
                Save
              </button>
            </span>
          </label>
        </div>

        <div className="set-card" style={{ marginTop: 14 }}>
          <div className="set-card-head">
            <Icon.shield size={15} />
            <h3>Connection</h3>
          </div>

          {phase === 'connected' ? (
            <div className="ce-status">
              <div className="ce-row">
                <span className="ce-badge ok">
                  <Icon.check size={12} />
                  Connected
                </span>
                {ce?.orgId && (
                  <span className="ce-meta">
                    project <b>{ce.orgId}</b>
                  </span>
                )}
                <span className="ce-meta mono">{ce?.endpoint ?? ce?.baseUrl}</span>
              </div>
              <button className="btn danger" onClick={() => void disconnect()}>
                <Icon.x size={14} />
                Disconnect
              </button>
            </div>
          ) : phase === 'pending' ? (
            <div className="ce-status pending">
              <div className="ce-row">
                <span className="stream-dots">
                  <i />
                  <i />
                  <i />
                </span>
                Waiting for you to approve in the browser…
              </div>
              <p className="ce-meta">
                Enter this code if asked: <span className="ce-code">{ce?.userCode}</span>
              </p>
              <div style={{ display: 'flex', gap: 9 }}>
                <button className="btn ghost" onClick={() => void cancelLogin()}>
                  Cancel
                </button>
                {ce?.verificationUri && (
                  <button
                    className="btn"
                    onClick={() => void window.api.openExternal(ce.verificationUri!)}
                  >
                    <Icon.external size={13} />
                    Reopen approval page
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="ce-status">
              <p className="ce-meta">Not connected.</p>
              {phase === 'error' && ce?.error && <div className="ce-error">{ce.error}</div>}
              <button className="btn primary" onClick={() => void startLogin()}>
                <Icon.external size={14} />
                Connect to Harnext Context Engine
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
