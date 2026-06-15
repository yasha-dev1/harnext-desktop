import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { JSX } from 'react'
import type { BranchList, Project } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import { projectColor, projectMark } from '../lib/ui'
import { Icon, Logo } from './icons'

interface TitlebarProps {
  projects: Project[]
  current: Project | null
  settingsActive: boolean
}

export default function Titlebar({
  projects,
  current,
  settingsActive
}: TitlebarProps): JSX.Element {
  const [menu, setMenu] = useState<'proj' | 'branch' | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const checkoutBranch = useAppStore((s) => s.checkoutBranch)
  const [branches, setBranches] = useState<BranchList | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)

  useEffect(() => {
    const h = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const color = current ? projectColor(current) : '#666'
  const mark = current ? projectMark(current) : '—'
  // The branch the project's context is on — the active worktree's branch, or main.
  const activeBranch = current?.activeBranch ?? current?.branch ?? '—'

  const openBranchMenu = (): void => {
    setMenu((m) => (m === 'branch' ? null : 'branch'))
    if (current?.isGit) {
      setBranches(null) // show "Fetching…" until the (fetch + list) resolves
      void window.api.projects.branches(current.id).then(setBranches)
    }
  }

  const pickBranch = async (branch: string): Promise<void> => {
    if (!current || switching) return
    setSwitching(branch)
    try {
      await checkoutBranch(current.id, branch)
    } finally {
      setSwitching(null)
      setMenu(null)
    }
  }

  const branchItems = [...(branches?.local ?? []), ...(branches?.remote ?? [])]

  return (
    <div className="titlebar">
      <div className="tb-brand">
        <Logo />
        <span className="tb-name">harnext</span>
      </div>
      <div className="tb-sep" />

      <div className="tb-proj" ref={ref}>
        <button className="tb-chip" onClick={() => setMenu((m) => (m === 'proj' ? null : 'proj'))}>
          <span className="mk" style={{ background: color + '22', color }}>
            {mark}
          </span>
          <span>{current?.name ?? 'No project'}</span>
          <Icon.chevron size={13} />
        </button>

        {current?.isGit && (
          <span className="tb-branch-wrap">
            <button
              className={'tb-branch tb-chip' + (current.activeBranch ? ' pinned' : '')}
              onClick={openBranchMenu}
              title="Switch branch — checks the chosen branch out into a worktree"
            >
              <Icon.branch size={13} />
              <b>{activeBranch}</b>
              <Icon.chevron size={12} />
            </button>
            {menu === 'branch' && (
              <div className="tb-pop tb-pop-branch">
                <div className="tb-pop-lbl">Switch branch</div>
                {!branches && <div className="tb-pop-msg">Fetching branches…</div>}
                {branches && branchItems.length === 0 && (
                  <div className="tb-pop-msg">No branches found.</div>
                )}
                {branchItems.map((b) => {
                  const isActive = (current.activeBranch ?? current.branch) === b
                  return (
                    <button
                      key={b}
                      className={'tb-pop-item' + (isActive ? ' active' : '')}
                      disabled={switching !== null}
                      onClick={() => void pickBranch(b)}
                    >
                      <span className="tb-branch-ic">
                        <Icon.branch size={13} />
                      </span>
                      <span className="tb-pop-nm mono">{b}</span>
                      {switching === b ? (
                        <span className="tick spin">
                          <Icon.loop size={13} />
                        </span>
                      ) : (
                        isActive && (
                          <span className="tick">
                            <Icon.check size={14} />
                          </span>
                        )
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </span>
        )}

        {menu === 'proj' && (
          <div className="tb-pop">
            <div className="tb-pop-lbl">Projects</div>
            {projects.map((p) => (
              <button
                key={p.id}
                className={'tb-pop-item' + (p.id === current?.id ? ' active' : '')}
                onClick={() => {
                  setMenu(null)
                  void window.api.projects.touch(p.id)
                  navigate(`/project/${p.id}`)
                }}
              >
                <span
                  className="mk"
                  style={{ background: projectColor(p) + '22', color: projectColor(p) }}
                >
                  {projectMark(p)}
                </span>
                <span className="tb-pop-meta">
                  <span className="tb-pop-nm">{p.name}</span>
                  <span className="tb-pop-pa">{p.path}</span>
                </span>
                {p.id === current?.id && (
                  <span className="tick">
                    <Icon.check size={14} />
                  </span>
                )}
              </button>
            ))}
            <div className="tb-pop-div" />
            <button
              className="tb-pop-item create"
              onClick={() => {
                setMenu(null)
                navigate('/')
              }}
            >
              <span className="mk" style={{ background: 'var(--bg-3)', color: 'var(--tx-1)' }}>
                <Icon.plus size={15} />
              </span>
              <span className="tb-pop-nm">Open another project…</span>
            </button>
          </div>
        )}
      </div>

      <div className="tb-spacer" />

      <div className="tb-tools">
        <button
          className={'tb-icon' + (settingsActive ? ' active' : '')}
          title="Settings"
          onClick={() => current && navigate(`/project/${current.id}/settings`)}
          disabled={!current}
        >
          <Icon.settings size={16} />
        </button>
      </div>
      <div className="tb-wc">
        <button className="wc" title="Minimize" onClick={() => window.api.win.minimize()}>
          <Icon.wcMin size={16} />
        </button>
        <button className="wc" title="Maximize" onClick={() => window.api.win.maximize()}>
          <Icon.wcMax size={15} />
        </button>
        <button className="wc close" title="Close" onClick={() => window.api.win.close()}>
          <Icon.x size={15} />
        </button>
      </div>
    </div>
  )
}
