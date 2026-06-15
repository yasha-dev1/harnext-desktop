import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { FsEntry, FsListing } from '@shared/types'
import { Icon } from './icons'

export type PickerMode = 'dir' | 'file'

/**
 * In-app IntelliJ-style file/folder picker. Browses the real filesystem via the
 * read-only `fs:listDir` IPC and resolves to a chosen path. Reuses the existing
 * `.browser` / `.dir` styles. `mode` controls what's selectable.
 */
export default function FilePicker({
  mode = 'dir',
  initialPath,
  onSelect,
  onCancel
}: {
  mode?: PickerMode
  initialPath?: string
  onSelect: (path: string) => void
  onCancel: () => void
}): JSX.Element {
  const [cwd, setCwd] = useState<string | null>(initialPath ?? null)
  const [listing, setListing] = useState<FsListing | null>(null)
  const [filter, setFilter] = useState('')
  const [active, setActive] = useState(0)
  const [pathEdit, setPathEdit] = useState('')
  // The selection target last mirrored into the path bar (adjust-on-render).
  const [syncedTarget, setSyncedTarget] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Seed at the home directory when no explicit start path was given.
  useEffect(() => {
    if (cwd) return
    void window.api.fs.home().then((h) => setCwd(h))
  }, [cwd])

  // Load the directory whenever the cwd changes. No row is pre-selected, so the
  // selection target defaults to the directory itself — the path bar then mirrors
  // the resolved current directory until the user highlights a child (the path-bar
  // sync below keeps it in step with the selection).
  useEffect(() => {
    if (!cwd) return
    let live = true
    void window.api.fs.listDir(cwd).then((res) => {
      if (!live) return
      setListing(res)
      setFilter('')
      setActive(-1)
    })
    return () => {
      live = false
    }
  }, [cwd])

  const filtered = useMemo(() => {
    const all = listing?.entries ?? []
    const q = filter.trim().toLowerCase()
    return q ? all.filter((e) => e.name.toLowerCase().includes(q)) : all
  }, [listing, filter])

  // Clamp the active index during render (filtering can shrink the list) rather
  // than via a setState-in-effect. `active < 0` means nothing is highlighted yet,
  // so the selection target falls back to the current directory.
  const activeIdx = filtered.length === 0 || active < 0 ? -1 : Math.min(active, filtered.length - 1)
  useEffect(() => {
    listRef.current?.querySelector('.dir.sel')?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const enter = (path: string): void => setCwd(path)
  const goUp = (): void => {
    if (listing?.parent) enter(listing.parent)
  }
  const goHome = (): void => void window.api.fs.home().then(enter)

  const current: FsEntry | undefined = activeIdx < 0 ? undefined : filtered[activeIdx]
  // The resolved directory currently being browsed (canonical, from the listing).
  const dirHere = listing?.path ?? cwd ?? ''
  const targetPath = mode === 'dir' ? (current?.isDir ? current.path : dirHere) : current?.path
  const canSelect = mode === 'dir' ? Boolean(cwd) : Boolean(current && !current.isDir)

  // Keep the path bar in step with what Select will actually pick: the highlighted
  // folder in dir mode (so a single click is reflected), otherwise the directory
  // being browsed. Mirrored on change (adjust-on-render) so the bar stays editable —
  // typing updates the buffer without moving the selection, and Enter navigates.
  const barTarget = mode === 'dir' ? (targetPath ?? '') : dirHere
  if (barTarget !== syncedTarget) {
    setSyncedTarget(barTarget)
    setPathEdit(barTarget)
  }

  const activateRow = (e: FsEntry): void => {
    if (e.isDir) enter(e.path)
    else if (mode === 'file') onSelect(e.path)
  }
  const confirm = (): void => {
    if (mode === 'dir') onSelect(targetPath || (cwd ?? ''))
    else if (current && !current.isDir) onSelect(current.path)
  }

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(Math.min(filtered.length - 1, activeIdx + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(Math.max(0, activeIdx - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (current) activateRow(current)
      else if (mode === 'dir') confirm()
    } else if (e.key === 'ArrowLeft' && filter === '') {
      e.preventDefault()
      goUp()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="browser browser-modal" onClick={(e) => e.stopPropagation()}>
        <div className="browser-bar">
          <button className="brz-btn" onClick={goUp} disabled={!listing?.parent} title="Up">
            <Icon.chevronL size={15} />
          </button>
          <button className="brz-btn" onClick={goHome} title="Home">
            <Icon.folder size={14} />
          </button>
          <input
            className="brz-path"
            value={pathEdit}
            spellCheck={false}
            onChange={(e) => setPathEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') enter(pathEdit.trim())
            }}
            aria-label="Path"
          />
        </div>

        <div className="browser-filter">
          <Icon.search size={13} />
          <input
            autoFocus
            value={filter}
            placeholder={`Filter ${mode === 'dir' ? 'folders' : 'files'}…  (↑ ↓ to move, Enter to open)`}
            onChange={(e) => {
              setFilter(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKey}
            aria-label="Filter"
          />
        </div>

        <div className="browser-list" ref={listRef}>
          {listing?.error ? (
            <div className="brz-msg error">{listing.error}</div>
          ) : filtered.length === 0 ? (
            <div className="brz-msg">
              {(listing?.entries.length ?? 0) === 0 ? 'Empty folder' : 'No matches'}
            </div>
          ) : (
            filtered.map((e, i) => (
              <div
                key={e.path}
                className={'dir' + (e.isDir ? '' : ' file') + (i === activeIdx ? ' sel' : '')}
                role="button"
                tabIndex={-1}
                onClick={() => setActive(i)}
                onDoubleClick={() => activateRow(e)}
              >
                <span className="dir-ic">
                  {e.isDir ? <Icon.folder size={16} /> : <Icon.file size={16} />}
                </span>
                <span className="dir-nm">{e.name}</span>
                {e.isDir && (
                  <button
                    className="dir-enter"
                    title="Open folder"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      enter(e.path)
                    }}
                  >
                    <Icon.chevronR size={15} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="browser-foot">
          <span className="sel-path">
            {mode === 'dir' ? (
              targetPath
            ) : current && !current.isDir ? (
              targetPath
            ) : (
              <span className="muted">Select a file…</span>
            )}
          </span>
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" disabled={!canSelect} onClick={confirm}>
            <Icon.folder size={14} />
            Select
          </button>
        </div>
      </div>
    </div>
  )
}
