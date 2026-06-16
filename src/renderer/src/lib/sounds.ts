export interface SoundOption {
  id: string
  label: string
}

// Built-in cues are short Web-Audio chimes (no files shipped). `custom` plays a
// user-chosen audio file from disk; `none` is silent.
export const SOUNDS: SoundOption[] = [
  { id: 'chime', label: 'Chime' },
  { id: 'ding', label: 'Ding' },
  { id: 'custom', label: 'Custom file…' },
  { id: 'none', label: 'None' }
]

let audioCtx: AudioContext | null = null
function ctx(): AudioContext {
  audioCtx ??= new AudioContext()
  return audioCtx
}

/** Play a short sequence of sine tones (a synthesized chime). */
function tones(freqs: number[], step = 0.16): void {
  const ac = ctx()
  if (ac.state === 'suspended') void ac.resume()
  const now = ac.currentTime
  freqs.forEach((f, i) => {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = f
    const t0 = now + i * step
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.32, t0 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + step)
    osc.connect(gain).connect(ac.destination)
    osc.start(t0)
    osc.stop(t0 + step + 0.02)
  })
}

function playUrl(url: string): void {
  const a = new Audio(url)
  a.volume = 0.85
  void a.play().catch(() => {})
}

/** What playing a cue id resolves to — pure so the dispatch is unit-testable. */
export type SoundAction =
  | { kind: 'silent' }
  | { kind: 'tones'; freqs: number[] }
  | { kind: 'file'; path: string }

/**
 * Decide what cue id `id` should play. Pure (no Web Audio / IPC) so the rules
 * are testable: `none`/empty and a `custom` cue with no file are silent; `ding`
 * and `chime` map to their tone sequences; and any unknown/removed id (e.g. a
 * persisted `'bruh'` from an older version) falls back to the chime — removing a
 * sound never silently disables the "agent done" cue.
 */
export function resolveSound(id: string, customPath?: string): SoundAction {
  if (!id || id === 'none') return { kind: 'silent' }
  if (id === 'custom') return customPath ? { kind: 'file', path: customPath } : { kind: 'silent' }
  if (id === 'ding') return { kind: 'tones', freqs: [880, 1318.5] }
  return { kind: 'tones', freqs: [659.25, 880] } // chime + fallback for removed ids
}

/**
 * Play the cue with the given id. `custom` loads `customPath` from disk via the
 * main process; unknown / `none` / a custom id with no path are silent.
 */
export function playSound(id: string, customPath?: string): void {
  const action = resolveSound(id, customPath)
  try {
    if (action.kind === 'file') {
      void window.api
        .readSound(action.path)
        .then((url) => url && playUrl(url))
        .catch(() => {})
    } else if (action.kind === 'tones') {
      tones(action.freqs)
    }
  } catch {
    /* audio unavailable in this environment — ignore */
  }
}
