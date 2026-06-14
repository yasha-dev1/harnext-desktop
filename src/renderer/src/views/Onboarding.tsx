import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { JSX } from 'react'
import type { Project, ProviderOption } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import ProjectPicker from '../components/ProjectPicker'
import { Icon, Logo } from '../components/icons'
import { ProviderLogo } from '../components/ProviderLogo'

function Stepper({ step, total }: { step: number; total: number }): JSX.Element {
  return (
    <div className="onb-steps">
      {Array.from({ length: total }).map((_, i) => (
        <Fragment key={i}>
          <div className={'onb-step-dot' + (i === step ? ' active' : i < step ? ' done' : '')}>
            <span className="d" />
          </div>
          {i < total - 1 && <span className="onb-step-line" />}
        </Fragment>
      ))}
    </div>
  )
}

function WelcomeStep({ onNext }: { onNext: () => void }): JSX.Element {
  const FEAT = [
    {
      ic: 'layers' as const,
      h: 'Organization context engine',
      p: 'Every agent taps the harnext context engine — the full history of your code, issues, PRs and chat across the org.'
    },
    {
      ic: 'loop' as const,
      h: 'Evaluator pattern',
      p: 'A smart model plans and reviews; an executor model writes the code, grounded in that shared context.'
    },
    {
      ic: 'diff' as const,
      h: 'Parallel worktrees',
      p: 'Run many agents at once, each in its own isolated git checkout. Review the diff and merge what you approve.'
    }
  ]
  return (
    <div className="onb-stage onb-hero">
      <Logo cls="onb-logo" />
      <h1>
        Welcome to <span className="amber">harnext</span>
      </h1>
      <p>
        The ultimate developer that actually knows your organization. The{' '}
        <span style={{ color: 'var(--p-text)', fontWeight: 600 }}>harnext context engine</span>{' '}
        gives every AI agent knowledge of all events across your org — so each one works like a
        senior engineer who&apos;s been on the team for years.
      </p>
      <div className="onb-feat">
        {FEAT.map((f) => {
          const Ic = Icon[f.ic]
          return (
            <div key={f.h} className="onb-feat-card">
              <span className="onb-feat-ic">
                <Ic size={17} />
              </span>
              <h4>{f.h}</h4>
              <p>{f.p}</p>
            </div>
          )
        })}
      </div>
      <button className="btn primary lg" onClick={onNext}>
        Get started
        <Icon.arrowR size={15} />
      </button>
    </div>
  )
}

function ThemeStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const saveSettings = useAppStore((s) => s.saveSettings)
  const theme = settings?.theme ?? 'dark'
  return (
    <div className="onb-stage">
      <h2 className="onb-h2">Light or dark?</h2>
      <p className="onb-sub">Pick the look that suits you. You can switch anytime in Settings.</p>

      <div className="onb-section" style={{ marginBottom: 8 }}>
        <div className="onb-section-lbl">
          <Icon.eye size={13} />
          Appearance
        </div>
        <div className="appearance-row">
          {(
            [
              ['dark', 'Dark', 'Default cool charcoal'],
              ['light', 'Light', 'Bright, easy on the eyes']
            ] as const
          ).map(([id, label, sub]) => (
            <button
              key={id}
              className={'appr ' + id + (theme === id ? ' on' : '')}
              onClick={() => void saveSettings({ theme: id })}
            >
              <div className="appr-prev">
                <span className="mini" />
                <span className="mini" style={{ width: 22 }} />
              </div>
              <div className="appr-foot">
                <span className="appr-rd" />
                <span>{label}</span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontWeight: 400,
                    fontSize: 11,
                    color: 'var(--tx-2)'
                  }}
                >
                  {sub}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="onb-foot">
        <button className="btn ghost" onClick={onBack}>
          <Icon.chevronL size={14} />
          Back
        </button>
        <span className="spacer" />
        <button className="btn primary" onClick={onNext}>
          Continue
          <Icon.arrowR size={15} />
        </button>
      </div>
    </div>
  )
}

function ProviderStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const saveSettings = useAppStore((s) => s.saveSettings)
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void window.api.providers.list().then(setProviders)
  }, [])

  const selected = providers.find((p) => p.id === settings?.provider)

  const selectProvider = (p: ProviderOption): void => {
    void saveSettings({ provider: p.id, model: p.defaultModel })
    setSaved(false)
    setKey('')
  }

  const next = async (): Promise<void> => {
    if (key.trim() && settings) {
      await window.api.providers.saveKey(settings.provider, key.trim())
    }
    onNext()
  }

  return (
    <div className="onb-stage">
      <h2 className="onb-h2">Connect a provider</h2>
      <p className="onb-sub">
        harnext routes your agents through this provider. You can fine-tune the exact models anytime
        in Settings.
      </p>

      <div className="onb-section" style={{ marginBottom: 18 }}>
        <div className="onb-section-lbl">
          <Icon.cube size={13} />
          Provider
        </div>
        <div className="prov-grid">
          {providers.map((p) => (
            <button
              key={p.id}
              className={'prov' + (settings?.provider === p.id ? ' on' : '')}
              onClick={() => selectProvider(p)}
            >
              <span className="prov-logo">
                <ProviderLogo id={p.id} size={20} />
              </span>
              <span className="prov-meta">
                <span className="prov-nm">{p.name}</span>
                <span className="prov-sub">{p.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-ic">
          <Icon.key size={16} />
        </span>
        <input
          type="password"
          placeholder="Paste your API key — stored locally in ~/.harnext"
          value={key}
          onChange={(e) => {
            setKey(e.target.value)
            setSaved(false)
          }}
          onBlur={() => {
            if (key.trim() && settings) {
              void window.api.providers
                .saveKey(settings.provider, key.trim())
                .then(() => setSaved(true))
            }
          }}
        />
        {(saved || (selected?.authenticated && !key)) && (
          <span className="spill st-done sm">
            <span className="sdot" />
            {saved ? 'Saved' : 'Connected'}
          </span>
        )}
      </div>

      <div className="onb-foot">
        <button className="btn ghost" onClick={onBack}>
          <Icon.chevronL size={14} />
          Back
        </button>
        <span className="spacer" />
        <button className="btn primary" onClick={() => void next()}>
          Continue
          <Icon.arrowR size={15} />
        </button>
      </div>
    </div>
  )
}

function ProjectStep({
  onOpen,
  onBack
}: {
  onOpen: (p: Project) => void
  onBack: () => void
}): JSX.Element {
  return (
    <div className="onb-stage">
      <h2 className="onb-h2">Open your first project</h2>
      <p className="onb-sub">
        Choose a git repository to work in. You can add more projects anytime.
      </p>
      <ProjectPicker onOpen={onOpen} />
      <div className="onb-foot">
        <button className="btn ghost" onClick={onBack}>
          <Icon.chevronL size={14} />
          Back
        </button>
        <span className="spacer" />
      </div>
    </div>
  )
}

export default function Onboarding(): JSX.Element {
  const [step, setStep] = useState(0)
  const navigate = useNavigate()
  const saveSettings = useAppStore((s) => s.saveSettings)
  const next = (): void => setStep((s) => Math.min(3, s + 1))
  const back = (): void => setStep((s) => Math.max(0, s - 1))

  const finish = (p: Project | null): void => {
    void saveSettings({ onboarded: true }).then(() => {
      navigate(p ? `/project/${p.id}` : '/', { replace: true })
    })
  }

  return (
    <div className="onb">
      <div className="onb-bar">
        <span className="brand">
          <Logo cls="tb-logo" />
          harnext
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button className="onb-skip" onClick={() => finish(null)}>
            Skip setup
          </button>
          <button className="wc" title="Minimize" onClick={() => window.api.win.minimize()}>
            <Icon.wcMin size={16} />
          </button>
          <button className="wc close" title="Close" onClick={() => window.api.win.close()}>
            <Icon.x size={15} />
          </button>
        </span>
      </div>
      <div className="onb-body">
        {step === 0 && <WelcomeStep onNext={next} />}
        {step === 1 && <ThemeStep onBack={back} onNext={next} />}
        {step === 2 && <ProviderStep onBack={back} onNext={next} />}
        {step === 3 && <ProjectStep onOpen={finish} onBack={back} />}
      </div>
      <Stepper step={step} total={4} />
    </div>
  )
}
