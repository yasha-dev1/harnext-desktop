import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useMatch } from 'react-router-dom'
import type { JSX } from 'react'
import { useAppStore } from './stores/useAppStore'
import Titlebar from './components/Titlebar'
import FilePicker from './components/FilePicker'
import Onboarding from './views/Onboarding'
import OpenProjectPage from './views/OpenProjectPage'
import ProjectShell from './views/ProjectShell'
import Compose from './views/Compose'
import AgentDetail from './views/AgentDetail'
import Settings from './views/Settings'
import LoopsHome from './views/LoopsHome'
import LoopDetail from './views/LoopDetail'
import NewLoopForm from './views/NewLoopForm'

// Renders the in-app file/folder picker whenever a `pickPath()` call is pending.
function GlobalFilePicker(): JSX.Element | null {
  const picker = useAppStore((s) => s.picker)
  const resolvePicker = useAppStore((s) => s.resolvePicker)
  if (!picker) return null
  return (
    <FilePicker
      mode={picker.mode}
      onSelect={(path) => resolvePicker(path)}
      onCancel={() => resolvePicker(null)}
    />
  )
}

function Shell(): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const projects = useAppStore((s) => s.projects)
  const match = useMatch('/project/:projectId/*')
  const projectId = match ? Number(match.params.projectId) : null
  const current = projects.find((p) => p.id === projectId) ?? null
  const settingsActive = Boolean(match?.params['*']?.startsWith('settings'))

  // theme
  useEffect(() => {
    document.documentElement.dataset.appearance = settings?.theme ?? 'dark'
  }, [settings?.theme])

  if (!settings) return <div className="win" />

  if (!settings.onboarded) {
    return <Onboarding />
  }

  return (
    <div className="win">
      <Titlebar projects={projects} current={current} settingsActive={settingsActive} />
      <Routes>
        <Route path="/" element={<OpenProjectPage />} />
        <Route path="/project/:projectId" element={<ProjectShell />}>
          <Route index element={<Compose />} />
          <Route path="agent/:agentId" element={<AgentDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="loops" element={<LoopsHome />} />
          <Route path="loops/new" element={<NewLoopForm />} />
          <Route path="loops/:loopId" element={<LoopDetail />} />
          <Route path="loops/:loopId/edit" element={<NewLoopForm />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default function App(): JSX.Element {
  const loadSettings = useAppStore((s) => s.loadSettings)
  const loadProjects = useAppStore((s) => s.loadProjects)

  useEffect(() => {
    void loadSettings()
    void loadProjects()
  }, [loadSettings, loadProjects])

  return (
    <HashRouter>
      <Shell />
      {/* Mounted at the root so the picker overlay is available on every screen,
          including onboarding (where Shell returns early). See #82. */}
      <GlobalFilePicker />
    </HashRouter>
  )
}
