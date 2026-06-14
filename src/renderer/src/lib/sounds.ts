import bruhUrl from '../assets/sounds/bruh.mp3'

export interface SoundOption {
  id: string
  label: string
}

// `bruh` is a bundled mp3; the others are short Web-Audio chimes so there are
// several choices without shipping more files. `none` is silent.
export const SOUNDS: SoundOption[] = [
  { id: 'bruh', label: 'Bruh' },
  { id: 'chime', label: 'Chime' },
  { id: 'ding', label: 'Ding' },
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

/** Play the sound with the given id. Unknown / `none` ids are silent. */
export function playSound(id: string): void {
  if (!id || id === 'none') return
  try {
    if (id === 'bruh') {
      const a = new Audio(bruhUrl)
      a.volume = 0.85
      void a.play().catch(() => {})
      return
    }
    if (id === 'chime') return tones([659.25, 880])
    if (id === 'ding') return tones([880, 1318.5])
  } catch {
    /* audio unavailable in this environment — ignore */
  }
}
