import type { Role, TimelineItem } from '@shared/types'

// Group a flat agent timeline into consecutive same-stage runs so each
// Planner / Executor / Evaluator stage can be collapsed as a unit (#106).

export interface TimelineGroup {
  role: Role
  /** Stable id for collapse persistence: the run's role + its first item's seq. */
  key: string
  items: TimelineItem[]
}

/** Collapse consecutive items of the same role into one group, in order. */
export function groupTimeline(items: TimelineItem[]): TimelineGroup[] {
  const groups: TimelineGroup[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last.role === item.role) last.items.push(item)
    else groups.push({ role: item.role, key: `${item.role}:${item.seq}`, items: [item] })
  }
  return groups
}

/** Number of tool calls in a group — shown as "N steps" on the stage header. */
export function stepCount(group: TimelineGroup): number {
  return group.items.filter((i) => i.kind === 'tool').length
}
