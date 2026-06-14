import { useNavigate } from 'react-router-dom'
import type { JSX } from 'react'
import ProjectPicker from '../components/ProjectPicker'

export default function OpenProjectPage(): JSX.Element {
  const navigate = useNavigate()

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
      </div>
    </main>
  )
}
