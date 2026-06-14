import type { KeyboardEvent } from 'react'
import type { AgentStatus, Project } from '@shared/types'

const PALETTE = ['#8B7CF6', '#FFA63D', '#34D399', '#5B8DEF', '#F8736A', '#22C7C0', '#F5B642']

export function projectColor(p: Pick<Project, 'name'>): string {
  let h = 0
  for (const ch of p.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function projectMark(p: Pick<Project, 'name'>): string {
  const parts = p.name.split(/[-_ .]+/).filter(Boolean)
  const mark = parts.length >= 2 ? parts[0][0] + parts[1][0] : p.name.slice(0, 2)
  return mark.toUpperCase()
}

export const STATUS: Record<AgentStatus, { label: string; cls: string; spin?: boolean }> = {
  running: { label: 'Working', cls: 'st-running', spin: true },
  review: { label: 'Review', cls: 'st-review' },
  input: { label: 'Needs input', cls: 'st-input' },
  done: { label: 'Merged', cls: 'st-done' },
  failed: { label: 'Failed', cls: 'st-failed' },
  paused: { label: 'Paused', cls: 'st-paused' }
}

export const DOT_COLOR: Record<AgentStatus, string> = {
  running: 'primary',
  review: 'warn',
  input: 'info',
  done: 'ok',
  failed: 'err',
  paused: 'tx-2'
}

export function timeAgo(ts: number | null): string {
  if (!ts) return 'never'
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

export function timeUntil(ts: number | null): string {
  if (!ts) return '—'
  const s = Math.max(0, Math.floor((ts - Date.now()) / 1000))
  if (s < 60) return 'in <1m'
  const m = Math.floor(s / 60)
  if (m < 60) return `in ${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `in ${h}h`
  return `in ${Math.round(h / 24)}d`
}

export function elapsed(from: number, to: number): string {
  const s = Math.max(0, Math.floor((to - from) / 1000))
  const m = Math.floor(s / 60)
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
  return `${m}m ${String(s % 60).padStart(2, '0')}s`
}

export function shortModel(model: string | null): string {
  return (model ?? '').split('/').pop() ?? ''
}

/**
 * Keyboard handler that fires `fn` on Enter/Space, for click-only `<div>`s that
 * carry `role="button"` + `tabIndex={0}` so they're operable without a mouse.
 */
export function onActivate(fn?: () => void) {
  return (e: KeyboardEvent): void => {
    if (!fn || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    fn()
  }
}
