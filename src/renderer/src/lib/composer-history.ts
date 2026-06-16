// Shell-style ↑/↓ prompt history for the composers (#133). Pure so the
// navigation state machine and the "should the arrow key hijack?" check are
// unit-testable without a DOM.

export interface HistoryStep {
  /** New position: an index into `history`, or null = back on the in-progress draft. */
  index: number | null
  /** Text the composer should now show. */
  text: string
}

/**
 * Move through sent-prompt history. `history` is chronological (oldest→newest);
 * `index` is the current position (null = editing the draft); `draft` is the
 * in-progress text preserved at the bottom of the stack.
 *
 * ↑ goes back in time (older), starting from the newest; ↓ goes forward, and
 * stepping past the newest returns to the draft. Bounds are clamped.
 */
export function navigateHistory(
  dir: 'up' | 'down',
  history: string[],
  index: number | null,
  draft: string
): HistoryStep {
  if (dir === 'up') {
    if (history.length === 0)
      return { index, text: index === null ? draft : (history[index] ?? draft) }
    if (index === null) return { index: history.length - 1, text: history[history.length - 1] }
    const next = Math.max(0, index - 1)
    return { index: next, text: history[next] }
  }
  // down
  if (index === null) return { index: null, text: draft }
  if (index >= history.length - 1) return { index: null, text: draft }
  const next = index + 1
  return { index: next, text: history[next] }
}

/**
 * Whether the caret sits at the first / last line of `value`, used to decide if
 * ↑ / ↓ should recall history instead of moving the cursor. Only an edge when
 * the selection is collapsed (no active text selection).
 */
export function caretAtEdge(
  value: string,
  selStart: number,
  selEnd: number
): { atFirstLine: boolean; atLastLine: boolean } {
  if (selStart !== selEnd) return { atFirstLine: false, atLastLine: false }
  return {
    atFirstLine: value.slice(0, selStart).indexOf('\n') === -1,
    atLastLine: value.slice(selStart).indexOf('\n') === -1
  }
}

/** Append a sent prompt to history (drop blanks + consecutive duplicates; cap length). */
export function pushHistory(history: string[], text: string, cap = 50): string[] {
  const t = text.trim()
  if (!t || history[history.length - 1] === t) return history
  const next = [...history, t]
  return next.length > cap ? next.slice(next.length - cap) : next
}
