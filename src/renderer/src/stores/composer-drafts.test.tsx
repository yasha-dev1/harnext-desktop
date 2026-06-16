// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import type { JSX } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from './useAppStore'
import { projectDraftKey } from '../lib/draft-keys'

// A minimal stand-in for the real composers (Compose / AgentDetail follow-up):
// it reads/writes the same store draft slice the views now use, so unmounting
// it models navigating away from the conversation.
function MiniComposer({ draftKey }: { draftKey: string }): JSX.Element {
  const text = useAppStore((s) => s.composerDrafts[draftKey] ?? '')
  const setDraft = useAppStore((s) => s.setDraft)
  return (
    <textarea
      aria-label="composer"
      value={text}
      onChange={(e) => setDraft(draftKey, e.target.value)}
    />
  )
}

const KEY = projectDraftKey(1)

describe('composer drafts persist across navigation (#132)', () => {
  beforeEach(() => {
    cleanup()
    useAppStore.setState({ composerDrafts: {} })
  })

  it('keeps the unsent draft when the composer unmounts and remounts', async () => {
    const user = userEvent.setup()
    const first = render(<MiniComposer draftKey={KEY} />)
    await user.type(screen.getByLabelText('composer'), 'half-written prompt')
    expect(useAppStore.getState().composerDrafts[KEY]).toBe('half-written prompt')

    // Navigate away (unmount) …
    first.unmount()
    // … and back (remount). The draft is still there.
    render(<MiniComposer draftKey={KEY} />)
    expect(screen.getByLabelText('composer')).toHaveValue('half-written prompt')
  })

  it('clearDraft empties it (what a successful send does)', () => {
    useAppStore.getState().setDraft(KEY, 'sending this')
    useAppStore.getState().clearDraft(KEY)
    expect(useAppStore.getState().composerDrafts[KEY]).toBeUndefined()
    render(<MiniComposer draftKey={KEY} />)
    expect(screen.getByLabelText('composer')).toHaveValue('')
  })

  it('keeps drafts for different surfaces independent', () => {
    const a = projectDraftKey(1)
    const b = projectDraftKey(2)
    useAppStore.getState().setDraft(a, 'project one')
    useAppStore.getState().setDraft(b, 'project two')
    expect(useAppStore.getState().composerDrafts[a]).toBe('project one')
    expect(useAppStore.getState().composerDrafts[b]).toBe('project two')
    // Clearing one leaves the other untouched.
    useAppStore.getState().clearDraft(a)
    expect(useAppStore.getState().composerDrafts[a]).toBeUndefined()
    expect(useAppStore.getState().composerDrafts[b]).toBe('project two')
  })
})
