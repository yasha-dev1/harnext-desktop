// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { UpdateInfo } from '@shared/types'

// Just the slice of the store these tests exercise — avoids depending on the
// (unexported) full AppStore type while keeping things typed (no `any`).
interface StoreSlice {
  composerDrafts: Record<string, string>
  promptHistory: Record<string, string[]>
  update: UpdateInfo | null
  setDraft: (key: string, text: string) => void
  clearDraft: (key: string) => void
  pushPromptHistory: (key: string, text: string) => void
  checkUpdate: () => Promise<void>
}

// The store wires `window.api.onAgentEvent` at module-eval time and some actions
// call other bridge methods, so install a mock bridge before each fresh import.
function installApi(over: Record<string, unknown> = {}): void {
  ;(window as unknown as { api: unknown }).api = { onAgentEvent: () => () => {}, ...over }
}

async function freshStore(): Promise<{ getState: () => StoreSlice }> {
  vi.resetModules()
  const mod = await import('./useAppStore')
  return mod.useAppStore as unknown as { getState: () => StoreSlice }
}

beforeEach(() => installApi())

describe('composer drafts (#132)', () => {
  it('setDraft stores per-key text and clearDraft removes just that key', async () => {
    const store = await freshStore()
    store.getState().setDraft('project:1', 'half-written prompt')
    store.getState().setDraft('agent:9', 'a follow-up')
    expect(store.getState().composerDrafts).toEqual({
      'project:1': 'half-written prompt',
      'agent:9': 'a follow-up'
    })

    store.getState().clearDraft('project:1')
    expect(store.getState().composerDrafts).toEqual({ 'agent:9': 'a follow-up' })
  })

  it('clearDraft on a missing key is a no-op (no churn)', async () => {
    const store = await freshStore()
    const before = store.getState().composerDrafts
    store.getState().clearDraft('nope')
    expect(store.getState().composerDrafts).toBe(before)
  })
})

describe('prompt history (#133)', () => {
  it('appends sent prompts per key and ignores consecutive duplicates', async () => {
    const store = await freshStore()
    store.getState().pushPromptHistory('project:1', 'first')
    store.getState().pushPromptHistory('project:1', 'second')
    store.getState().pushPromptHistory('project:1', 'second') // dup — dropped
    expect(store.getState().promptHistory['project:1']).toEqual(['first', 'second'])
  })

  it('keeps history separate per key', async () => {
    const store = await freshStore()
    store.getState().pushPromptHistory('a', 'x')
    store.getState().pushPromptHistory('b', 'y')
    expect(store.getState().promptHistory).toEqual({ a: ['x'], b: ['y'] })
  })
})

describe('checkUpdate (#162) — best-effort, never throws', () => {
  const info: UpdateInfo = { current: '0.1.0', latest: '0.2.0', url: 'u', isUpdate: true }

  it('caches the result when the bridge returns one', async () => {
    installApi({ checkForUpdate: vi.fn().mockResolvedValue(info) })
    const store = await freshStore()
    expect(store.getState().update).toBeNull()
    await store.getState().checkUpdate()
    expect(store.getState().update).toEqual(info)
  })

  it('leaves update null when the check throws', async () => {
    installApi({ checkForUpdate: vi.fn().mockRejectedValue(new Error('offline')) })
    const store = await freshStore()
    await store.getState().checkUpdate()
    expect(store.getState().update).toBeNull()
  })

  it('leaves update null when the bridge lacks checkForUpdate', async () => {
    installApi() // no checkForUpdate
    const store = await freshStore()
    await store.getState().checkUpdate()
    expect(store.getState().update).toBeNull()
  })
})
