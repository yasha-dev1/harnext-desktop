import type { JSX } from 'react'
import type { Project } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import { onActivate, projectColor, projectMark, timeAgo } from '../lib/ui'
import { Icon } from './icons'

/**
 * Adaptive picker: when projects exist the recent list is the hero with a
 * compact "open another folder" affordance; otherwise the drop zone leads.
 * Browsing uses the OS directory dialog.
 */
export default function ProjectPicker({
  onOpen
}: {
  onOpen: (project: Project) => void
}): JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const openProjectDialog = useAppStore((s) => s.openProjectDialog)

  const browse = async (): Promise<void> => {
    const project = await openProjectDialog()
    if (project) onOpen(project)
  }

  if (projects.length === 0) {
    return (
      <div className="picker">
        <div
          className="drop"
          role="button"
          tabIndex={0}
          onClick={() => void browse()}
          onKeyDown={onActivate(() => void browse())}
        >
          <div className="drop-ic">
            <Icon.folderOpen size={26} />
          </div>
          <h3>Open a project folder</h3>
          <p>
            Point harnext at a git repository. Agents run in isolated worktrees, so your
            <br />
            working copy on <code>main</code> is never touched.
          </p>
          <button className="btn primary lg">
            <Icon.folder size={15} />
            Browse files…
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="picker">
      <div className="recent" style={{ marginTop: 0 }}>
        <div className="recent-lbl">Recent projects</div>
        <div className="recent-list">
          {projects.map((p) => {
            const color = projectColor(p)
            return (
              <button
                key={p.id}
                className="recent-item"
                onClick={() => {
                  void window.api.projects.touch(p.id)
                  onOpen(p)
                }}
              >
                <span
                  className="recent-mk"
                  style={{ background: color + '22', color, border: '1px solid ' + color + '55' }}
                >
                  {projectMark(p)}
                </span>
                <div className="recent-meta">
                  <div className="recent-nm">{p.name}</div>
                  <div className="recent-pa">{p.path}</div>
                </div>
                <span className="recent-time">{timeAgo(p.lastOpenedAt)}</span>
              </button>
            )
          })}
        </div>
      </div>

      <button className="add-row" onClick={() => void browse()}>
        <span className="add-row-ic">
          <Icon.plus size={18} />
        </span>
        <span className="add-row-meta">
          <span className="add-row-nm">Open another folder…</span>
          <span className="add-row-sub">Browse for a git repository to add</span>
        </span>
        <Icon.folderOpen size={17} />
      </button>
    </div>
  )
}
