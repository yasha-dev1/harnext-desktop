import { describe, it, expect } from 'vitest'
import { resolveSound, SOUNDS } from './sounds'

describe('resolveSound (#138)', () => {
  it('is silent for none / empty', () => {
    expect(resolveSound('none')).toEqual({ kind: 'silent' })
    expect(resolveSound('')).toEqual({ kind: 'silent' })
  })

  it('plays a custom file when a path is given, else silent', () => {
    expect(resolveSound('custom', '/cues/done.mp3')).toEqual({
      kind: 'file',
      path: '/cues/done.mp3'
    })
    expect(resolveSound('custom')).toEqual({ kind: 'silent' })
    expect(resolveSound('custom', '')).toEqual({ kind: 'silent' })
  })

  it('maps the built-in cues to their tone sequences', () => {
    expect(resolveSound('ding')).toEqual({ kind: 'tones', freqs: [880, 1318.5] })
    expect(resolveSound('chime')).toEqual({ kind: 'tones', freqs: [659.25, 880] })
  })

  it('falls back to the chime for an unknown / removed id (e.g. legacy "bruh")', () => {
    // Removing a bundled sound must never silently disable the cue.
    expect(resolveSound('bruh')).toEqual({ kind: 'tones', freqs: [659.25, 880] })
    expect(resolveSound('whatever-old-id')).toEqual({ kind: 'tones', freqs: [659.25, 880] })
  })

  it('every selectable built-in cue resolves to a playable (non-silent) action, except None', () => {
    for (const s of SOUNDS) {
      const action = resolveSound(s.id, s.id === 'custom' ? '/x.mp3' : undefined)
      if (s.id === 'none') expect(action.kind).toBe('silent')
      else expect(action.kind).not.toBe('silent')
    }
  })
})
