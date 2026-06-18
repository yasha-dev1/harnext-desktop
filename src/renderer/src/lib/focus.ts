/**
 * Re-focus the composer textarea so it reliably accepts keystrokes.
 *
 * Electron/Chromium (most visibly on Windows) can leave the renderer's focus
 * controller desynced from the native text widget after an element that held
 * focus is removed from the DOM — e.g. the "Remove" button in the delete-project
 * dialog, which unmounts on the same tick the project is deleted. The composer
 * then shows its `:focus-within` ring and accepts paste/submit, yet the caret
 * doesn't blink and typing does nothing (#191).
 *
 * A plain `.focus()` on an element the browser already considers focused is a
 * no-op and won't clear the desync, so we blur first: that detaches the stale
 * native widget and the following `.focus()` re-attaches a live one. The caret
 * is moved to the end of any existing draft.
 */
export function refocusComposer(ta: HTMLTextAreaElement | null): void {
  if (!ta) return
  ta.blur()
  ta.focus()
  const end = ta.value.length
  ta.setSelectionRange(end, end)
}
