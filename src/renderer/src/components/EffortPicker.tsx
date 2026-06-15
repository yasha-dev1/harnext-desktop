import type { JSX } from 'react'
import type { ThinkingLevel } from '@shared/types'

/** Reasoning-effort levels, ordered low → high, with display labels. */
const THINKING_LEVELS: { value: ThinkingLevel; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Max' }
]

/**
 * Reasoning-effort selector — a styled `<select>` matching the app's `.ctl-sel`
 * dropdowns. The chosen level is clamped per model by core/pi-ai, so every level
 * is offered for every model.
 */
export function EffortPicker({
  value,
  onChange
}: {
  value: ThinkingLevel
  onChange: (v: ThinkingLevel) => void
}): JSX.Element {
  return (
    <span className="ctl-sel" title="Reasoning effort — how hard the model thinks before answering">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ThinkingLevel)}
        aria-label="Reasoning effort"
      >
        {THINKING_LEVELS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </span>
  )
}
