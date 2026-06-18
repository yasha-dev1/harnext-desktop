import { useState } from 'react'
import { useMatch, useNavigate, useParams } from 'react-router-dom'
import type { JSX } from 'react'
import type { AgentMeta, Project } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import { DOT_COLOR, STATUS, projectColor, projectMark, userInitials } from '../lib/ui'
import { filterConversations } from '../lib/conversation-filter'
import { shouldShowBadge } from '../lib/update-badge'
import { Icon } from './icons'

function AgentCard({
  agent,
  active,
  onClick,
  onDiscard
}: {
  agent: AgentMeta
  active: boolean
  onClick: () => void
  // When provided, a hover/focus-revealed trash control is shown.
  onDiscard?: () => void
}): JSX.Element {
  const s = STATUS[agent.status]
  return (
    // A div (not a button) so the discard control can be a real nested button
    // without invalid button-in-button markup; keyboard support is added back.
    <div
      className={
        'agent-card' + (agent.status === 'running' ? ' running' : '') + (active ? ' active' : '')
      }
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <div className="agent-top">
        <span
          className={'sdot' + (s.spin ? ' spin' : '')}
          style={{ color: `var(--${DOT_COLOR[agent.status]})` }}
        />
        <span className="agent-title">{agent.title}</span>
        {onDiscard && (
          <button
            className="agent-discard"
            title="Discard agent"
            aria-label="Discard agent"
            onClick={(e) => {
              e.stopPropagation()
              onDiscard()
            }}
          >
            <Icon.trash size={13} />
          </button>
        )}
      </div>
      <div className="agent-meta">
        {agent.branch ? (
          <span className="agent-branch">
            <Icon.branch size={12} />
            {agent.branch.replace('agent/', '')}
          </span>
        ) : (
          <span className="agent-branch">{agent.progress}</span>
        )}
        {(agent.add > 0 || agent.del > 0) && (
          <span className="agent-diffstat">
            <span className="add">+{agent.add}</span>
            <span className="del">−{agent.del}</span>
          </span>
        )}
      </div>
    </div>
  )
}

export default function AgentsSidebar({ project }: { project: Project }): JSX.Element {
  const navigate = useNavigate()
  const { agentId } = useParams()
  const settingsMatch = useMatch('/project/:projectId/settings')
  const loopsMatch = useMatch('/project/:projectId/loops/*')
  const loopsRootMatch = useMatch('/project/:projectId/loops')
  const contextMatch = useMatch('/project/:projectId/context')
  const homeMatch = useMatch({ path: '/project/:projectId', end: true })

  const ceConnected = useAppStore((s) => s.contextEngine?.connected ?? false)
  const agentIds = useAppStore((s) => s.agentIdsByProject[project.id]) ?? []
  const agents = useAppStore((s) => s.agents)
  const loops = useAppStore((s) => s.loopsByProject[project.id]) ?? []
  const discardAgent = useAppStore((s) => s.discardAgent)
  const displayName = useAppStore((s) => s.settings?.displayName)?.trim() || 'You'
  // Mirror the titlebar's "update available" badge on this settings entry too, so
  // both ways into Settings surface a pending update (#125).
  const updateAvailable = shouldShowBadge(useAppStore((s) => s.update))

  const handleDiscard = (a: AgentMeta): void => {
    if (!confirm('Discard this agent? Its worktree and branch are deleted.')) return
    void discardAgent(a.id).then(() => {
      // If the discarded agent is the one open in the detail view, go home.
      if (agentId === a.id) navigate(`/project/${project.id}`)
    })
  }

  const [query, setQuery] = useState('')
  const list = agentIds.map((id) => agents[id]).filter(Boolean)
  // Filter by title first (#116), then keep the running/finished grouping.
  const filtered = filterConversations(list, query)
  const running = filtered.filter((a) =>
    ['running', 'review', 'input', 'paused'].includes(a.status)
  )
  const finished = filtered.filter((a) => ['done', 'failed'].includes(a.status))
  const searching = query.trim().length > 0
  const noMatches = searching && running.length === 0 && finished.length === 0
  const color = projectColor(project)

  return (
    <aside className="aside">
      <div className="aside-head">
        <button className="aside-back" onClick={() => navigate('/')}>
          <Icon.chevronL size={13} />
          Projects
        </button>
        <button
          className="aside-proj"
          onClick={() => navigate(`/project/${project.id}`)}
          title="New agent"
        >
          <span
            className="aside-mk"
            style={{ background: color + '22', color, border: '1px solid ' + color + '55' }}
          >
            {projectMark(project)}
          </span>
          <div className="aside-proj-meta">
            <div className="aside-proj-nm">{project.name}</div>
            <div className="aside-proj-pa">{project.path}</div>
          </div>
        </button>
      </div>

      <div className="aside-scroll">
        <button
          className={'aside-menu' + (homeMatch ? ' active' : '')}
          onClick={() => navigate(`/project/${project.id}`)}
        >
          <Icon.plus size={16} />
          <span className="aside-menu-label">New Task</span>
        </button>
        <button
          className={'aside-menu' + (loopsMatch || loopsRootMatch ? ' active' : '')}
          onClick={() => navigate(`/project/${project.id}/loops`)}
        >
          <Icon.loop size={16} />
          <span className="aside-menu-label">Loops</span>
          {loops.length > 0 && <span className="aside-menu-count">{loops.length}</span>}
          <Icon.chevronR size={14} />
        </button>
        <button
          className={'aside-menu' + (contextMatch ? ' active' : '')}
          onClick={() => navigate(`/project/${project.id}/context`)}
        >
          <Icon.brain size={16} />
          <span className="aside-menu-label">Context Engine</span>
          {ceConnected && <span className="ce-dot" title="Connected" />}
          <Icon.chevronR size={14} />
        </button>

        {list.length > 0 && (
          <div className="aside-search">
            <Icon.search size={13} />
            <input
              value={query}
              placeholder="Search conversations…"
              aria-label="Search conversations"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}

        {noMatches && <div className="aside-empty">No conversations match “{query}”.</div>}

        {(running.length > 0 || !searching) && (
          <div className="aside-sect">
            <span>Active</span>
            {running.length > 0 && <span className="count">{running.length}</span>}
          </div>
        )}
        {running.length === 0 && !searching && (
          <div className="aside-empty">
            No active agents.
            <br />
            Start one from the project home.
          </div>
        )}
        {running.map((a) => (
          <AgentCard
            key={a.id}
            agent={a}
            active={agentId === a.id}
            onClick={() => navigate(`/project/${project.id}/agent/${a.id}`)}
            onDiscard={() => handleDiscard(a)}
          />
        ))}

        {finished.length > 0 && (
          <>
            <div className="aside-sect" style={{ marginTop: 10 }}>
              <span>Recent</span>
              <span className="count">{finished.length}</span>
            </div>
            {finished.map((a) => (
              <AgentCard
                key={a.id}
                agent={a}
                active={agentId === a.id}
                onClick={() => navigate(`/project/${project.id}/agent/${a.id}`)}
                onDiscard={() => handleDiscard(a)}
              />
            ))}
          </>
        )}
      </div>

      <div className="aside-foot">
        <button
          className={'aside-link' + (settingsMatch ? ' active' : '')}
          title={updateAvailable ? 'Settings — update available' : 'Settings'}
          onClick={() => navigate(`/project/${project.id}/settings`)}
        >
          <Icon.settings size={17} />
          <span>Settings</span>
          {updateAvailable && <span className="aside-badge" aria-label="Update available" />}
        </button>
        <button
          className="aside-user"
          title="Edit your name in Settings"
          onClick={() => navigate(`/project/${project.id}/settings`)}
        >
          <span className="aside-av">{userInitials(displayName)}</span>
          <div className="aside-user-meta">
            <div className="aside-user-nm">{displayName}</div>
            <div className="aside-user-sub">Self-hosted</div>
          </div>
        </button>
      </div>
    </aside>
  )
}
