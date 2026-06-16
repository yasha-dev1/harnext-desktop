import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { createTwoFilesPatch } from 'diff'

const MAX_SNAPSHOT_BYTES = 1024 * 1024

export interface CapturedChange {
  path: string
  beforeContent: string | null
  afterContent: string | null
  diff: string
  additions: number
  deletions: number
}

/**
 * Count added/removed lines in a unified diff, excluding the `+++`/`---` file
 * headers (so they aren't miscounted as one addition + one deletion). This
 * header exclusion is the precise thing #36 fixed; keep it guarded by a test.
 */
export function countDiffLines(diff: string): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++
  }
  return { additions, deletions }
}

/**
 * Edit/Write tool results don't include diffs, so we snapshot the target file
 * when the tool starts and compare when it ends — the same trick the harnext
 * interactive CLI uses.
 */
export class DiffTracker {
  private snapshots = new Map<string, { path: string; before: string | null }>()

  constructor(private cwd: string) {}

  onToolStart(toolCallId: string, toolName: string, args: Record<string, unknown>): void {
    if (toolName !== 'edit' && toolName !== 'write') return
    const path = this.resolvePath(args)
    if (!path) return
    this.snapshots.set(toolCallId, { path, before: readCapped(path) })
  }

  onToolEnd(toolCallId: string, isError: boolean): CapturedChange | null {
    const snap = this.snapshots.get(toolCallId)
    this.snapshots.delete(toolCallId)
    if (!snap || isError) return null

    const after = readCapped(snap.path)
    if (after === snap.before) return null

    const diff = createTwoFilesPatch(snap.path, snap.path, snap.before ?? '', after ?? '', '', '')
    const { additions, deletions } = countDiffLines(diff)
    return {
      path: snap.path,
      beforeContent: snap.before,
      afterContent: after,
      diff,
      additions,
      deletions
    }
  }

  private resolvePath(args: Record<string, unknown>): string | null {
    const raw = args.path ?? args.file_path
    if (typeof raw !== 'string' || raw.length === 0) return null
    return isAbsolute(raw) ? raw : resolve(this.cwd, raw)
  }
}

function readCapped(path: string): string | null {
  try {
    const content = readFileSync(path, 'utf-8')
    return content.length > MAX_SNAPSHOT_BYTES ? null : content
  } catch {
    return null
  }
}
