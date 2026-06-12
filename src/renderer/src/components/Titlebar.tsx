import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { JSX } from 'react'
import type { Project } from '@shared/types'
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
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const h = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const color = current ? projectColor(current) : '#666'
  const mark = current ? projectMark(current) : '—'

  return (
    <div className="titlebar">
      <div className="tb-brand">
        <Logo />
        <span className="tb-name">harnext</span>
      </div>
      <div className="tb-sep" />

      <div className="tb-proj" ref={ref}>
        <button className="tb-chip" onClick={() => setOpen((o) => !o)}>
          <span className="mk" style={{ background: color + '22', color }}>
            {mark}
          </span>
          <span>{current?.name ?? 'No project'}</span>
          <Icon.chevron size={13} />
        </button>
        <span className="tb-branch tb-chip" style={{ cursor: 'default' }}>
          <Icon.branch size={13} />
          <b>{current?.branch ?? '—'}</b>
        </span>
        {open && (
          <div className="tb-pop">
            <div className="tb-pop-lbl">Projects</div>
            {projects.map((p) => (
              <button
                key={p.id}
                className={'tb-pop-item' + (p.id === current?.id ? ' active' : '')}
                onClick={() => {
                  setOpen(false)
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
                setOpen(false)
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
