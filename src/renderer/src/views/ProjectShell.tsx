import { useEffect } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router-dom'
import type { JSX } from 'react'
import { useAppStore } from '../stores/useAppStore'
import AgentsSidebar from '../components/AgentsSidebar'

export default function ProjectShell(): JSX.Element {
  const { projectId: projectIdParam } = useParams()
  const projectId = Number(projectIdParam)
  const navigate = useNavigate()

  const projectsLoaded = useAppStore((s) => s.projectsLoaded)
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId))
  const loadAgents = useAppStore((s) => s.loadAgents)
  const loadLoops = useAppStore((s) => s.loadLoops)

  useEffect(() => {
    if (Number.isFinite(projectId)) {
      void loadAgents(projectId)
      void loadLoops(projectId)
    }
  }, [projectId, loadAgents, loadLoops])

  useEffect(() => {
    if (projectsLoaded && !project) navigate('/', { replace: true })
  }, [projectsLoaded, project, navigate])

  if (!project) return <div className="body" />

  return (
    <div className="body">
      <AgentsSidebar project={project} />
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
