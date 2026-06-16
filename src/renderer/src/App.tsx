import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useMatch } from 'react-router-dom'
import type { JSX } from 'react'
import { useAppStore } from './stores/useAppStore'
import { UpdateToast } from './components/UpdateToast'
import { shouldShowUpdate } from './lib/update-popup'
import { shouldShowBadge } from './lib/update-badge'
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
  const update = useAppStore((s) => s.update)
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
      <Titlebar
        projects={projects}
        current={current}
        settingsActive={settingsActive}
        updateAvailable={shouldShowBadge(update)}
      />
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

const UPDATE_DISMISSED_KEY = 'harnext.updateDismissed'

// Shows a top-right one-click update popup when the store's update check found a
// newer release (#162). Dismissing a version is remembered (localStorage) so it
// won't nag until a newer one ships. The check itself runs once in App and is
// shared with the Settings-entry badge (#125), so there's a single network call.
function UpdateGate(): JSX.Element | null {
  const info = useAppStore((s) => s.update)
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return localStorage.getItem(UPDATE_DISMISSED_KEY)
    } catch {
      return null
    }
  })

  if (!info || !shouldShowUpdate(info, dismissed)) return null

  return (
    <UpdateToast
      info={info}
      onUpdate={() => {
        if (info.url) void window.api.openExternal(info.url)
      }}
      onDismiss={() => {
        try {
          if (info.latest) localStorage.setItem(UPDATE_DISMISSED_KEY, info.latest)
        } catch {
          /* ignore persistence failures */
        }
        setDismissed(info.latest)
      }}
    />
  )
}

export default function App(): JSX.Element {
  const loadSettings = useAppStore((s) => s.loadSettings)
  const loadProjects = useAppStore((s) => s.loadProjects)
  const checkUpdate = useAppStore((s) => s.checkUpdate)

  useEffect(() => {
    void loadSettings()
    void loadProjects()
    void checkUpdate()
  }, [loadSettings, loadProjects, checkUpdate])

  return (
    <HashRouter>
      <Shell />
      {/* Mounted once at the root so the in-app file/folder picker is available
          in every state — including onboarding, whose early return previously
          left it unmounted (#82). It reads everything it needs from the store. */}
      <GlobalFilePicker />
      <UpdateGate />
    </HashRouter>
  )
}
