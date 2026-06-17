// Shared predicate for the composer's "is there anything to send?" check (#142),
// used by both the Start/Send guard and the button's `disabled` state so the
// affordance can't say "enabled" while the click is a silent no-op.

/** True when the composer has something to submit: non-blank text or ≥1 image. */
export function canSubmitComposer(text: string, hasAttachment: boolean): boolean {
  return text.trim().length > 0 || hasAttachment
}
