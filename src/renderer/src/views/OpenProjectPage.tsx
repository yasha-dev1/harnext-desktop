import { useNavigate } from 'react-router-dom'
import type { JSX } from 'react'
import { useAppStore } from '../stores/useAppStore'
import ProjectPicker from '../components/ProjectPicker'
import { Icon } from '../components/icons'

export default function OpenProjectPage(): JSX.Element {
  const navigate = useNavigate()
  const projects = useAppStore((s) => s.projects)
  const removeProject = useAppStore((s) => s.removeProject)

  return (
    <main className="main" style={{ flex: 1 }}>
      <div className="page view">
        <div className="page-head">
          <div className="page-crumb">
            harnext<span className="sep">/</span>
            <span>open project</span>
          </div>
          <h1 className="page-title">Open a project</h1>
          <p className="page-desc">
            Choose a folder to work in. harnext indexes the repo and gets ready to dispatch agents.
          </p>
        </div>
        <ProjectPicker onOpen={(p) => navigate(`/project/${p.id}`)} />

        {projects.length > 0 && (
          <div style={{ marginTop: 26, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn ghost danger"
              onClick={() => {
                const name = prompt(
                  'Type the name of the project to remove (its conversations are deleted; files on disk are kept):'
                )
                const target = projects.find((p) => p.name === name)
                if (target) void removeProject(target.id)
              }}
            >
              <Icon.trash size={14} />
              Remove a project…
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
