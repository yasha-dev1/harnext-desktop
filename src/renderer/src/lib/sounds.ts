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

/**
 * Play the cue with the given id. `custom` loads `customPath` from disk via the
 * main process; unknown / `none` / a custom id with no path are silent.
 */
export function playSound(id: string, customPath?: string): void {
  if (!id || id === 'none') return
  try {
    if (id === 'custom') {
      if (!customPath) return
      void window.api
        .readSound(customPath)
        .then((url) => url && playUrl(url))
        .catch(() => {})
      return
    }
    if (id === 'ding') return tones([880, 1318.5])
    // 'chime' and any unknown/removed id (e.g. a persisted 'bruh' from an older
    // version) fall back to the default chime — removing a sound never silently
    // disables the cue.
    return tones([659.25, 880])
  } catch {
    /* audio unavailable in this environment — ignore */
  }
}
