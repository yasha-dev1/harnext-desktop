import { describe, it, expect } from 'vitest'
import type { AppSettings } from '../shared/types'
import { mergeStoredSettings } from './settings-merge'

const DEFAULTS: AppSettings = {
  onboarded: false,
  theme: 'dark',
  displayName: 'You',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  smart: 'claude-opus-4-8',
  executor: 'claude-sonnet-4-6',
  thinkingLevel: 'medium',
  mode: 'acceptEdits',
  editor: 'VS Code',
  openOnDone: false,
  evalLoop: true,
  worktreeRoot: '/home/me/.harnext-desktop/worktrees',
  soundOnDone: true,
  doneSound: 'chime',
  customSoundPath: ''
}
const row = (key: string, value: unknown): { key: string; value: string } => ({
  key,
  value: JSON.stringify(value)
})

describe('mergeStoredSettings (#176/#138)', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(mergeStoredSettings([], DEFAULTS)).toEqual(DEFAULTS)
  })

  it('overrides defaults with stored values (decoding JSON per row)', () => {
    const out = mergeStoredSettings([row('onboarded', true), row('model', 'gpt-5')], DEFAULTS)
    expect(out.onboarded).toBe(true)
    expect(out.model).toBe('gpt-5')
    expect(out.provider).toBe('anthropic') // untouched default
  })

  it('preserves falsy stored values (false / empty string) over truthy defaults', () => {
    const out = mergeStoredSettings([row('soundOnDone', false), row('displayName', '')], DEFAULTS)
    expect(out.soundOnDone).toBe(false)
    expect(out.displayName).toBe('')
  })

  it('skips a corrupt (non-JSON) row instead of failing the whole load', () => {
    const out = mergeStoredSettings(
      [{ key: 'model', value: '{not valid json' }, row('theme', 'light')],
      DEFAULTS
    )
    expect(out.model).toBe(DEFAULTS.model) // corrupt row ignored → default kept
    expect(out.theme).toBe('light') // the valid row still applied
  })

  it("migrates the removed 'bruh' doneSound to the default", () => {
    const out = mergeStoredSettings([row('doneSound', 'bruh')], DEFAULTS)
    expect(out.doneSound).toBe(DEFAULTS.doneSound)
  })

  it('keeps a valid custom doneSound as-is', () => {
    expect(mergeStoredSettings([row('doneSound', 'ding')], DEFAULTS).doneSound).toBe('ding')
  })

  it('does not mutate the passed-in defaults object', () => {
    const snapshot = { ...DEFAULTS }
    mergeStoredSettings([row('doneSound', 'bruh'), row('theme', 'light')], DEFAULTS)
    expect(DEFAULTS).toEqual(snapshot)
  })
})
