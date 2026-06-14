import { useMatch, useNavigate, useParams } from 'react-router-dom'
import type { JSX } from 'react'
import type { AgentMeta, Project } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import { DOT_COLOR, STATUS, projectColor, projectMark } from '../lib/ui'
import { Icon } from './icons'

function AgentCard({
  agent,
  active,
  onClick
}: {
  agent: AgentMeta
  active: boolean
  onClick: () => void
}): JSX.Element {
  const s = STATUS[agent.status]
  return (
    <button
      className={
        'agent-card' + (agent.status === 'running' ? ' running' : '') + (active ? ' active' : '')
      }
      onClick={onClick}
    >
      <div className="agent-top">
        <span
          className={'sdot' + (s.spin ? ' spin' : '')}
          style={{ color: `var(--${DOT_COLOR[agent.status]})` }}
        />
        <span className="agent-title">{agent.title}</span>
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
    </button>
  )
}

export default function AgentsSidebar({ project }: { project: Project }): JSX.Element {
  const navigate = useNavigate()
  const { agentId } = useParams()
  const settingsMatch = useMatch('/project/:projectId/settings')
  const loopsMatch = useMatch('/project/:projectId/loops/*')
  const loopsRootMatch = useMatch('/project/:projectId/loops')

  const agentIds = useAppStore((s) => s.agentIdsByProject[project.id]) ?? []
  const agents = useAppStore((s) => s.agents)
  const loops = useAppStore((s) => s.loopsByProject[project.id]) ?? []

  const list = agentIds.map((id) => agents[id]).filter(Boolean)
  const running = list.filter((a) => ['running', 'review', 'input', 'paused'].includes(a.status))
  const finished = list.filter((a) => ['done', 'failed'].includes(a.status))
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
          className={'aside-menu' + (loopsMatch || loopsRootMatch ? ' active' : '')}
          onClick={() => navigate(`/project/${project.id}/loops`)}
        >
          <Icon.loop size={16} />
          <span className="aside-menu-label">Loops</span>
          {loops.length > 0 && <span className="aside-menu-count">{loops.length}</span>}
          <Icon.chevronR size={14} />
        </button>

        <div className="aside-sect">
          <span>Active</span>
          {running.length > 0 && <span className="count">{running.length}</span>}
        </div>
        {running.length === 0 && (
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
              />
            ))}
          </>
        )}
      </div>

      <div className="aside-foot">
        <button
          className={'aside-link' + (settingsMatch ? ' active' : '')}
          onClick={() => navigate(`/project/${project.id}/settings`)}
        >
          <Icon.settings size={17} />
          <span>Settings</span>
        </button>
        <div className="aside-user">
          <span className="aside-av">ya</span>
          <div className="aside-user-meta">
            <div className="aside-user-nm">yasha@local</div>
            <div className="aside-user-sub">Self-hosted</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
