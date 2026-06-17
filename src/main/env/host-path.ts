import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

/**
 * Fixing the GUI-launch PATH (#195).
 *
 * When an Electron app is launched from the OS GUI (a macOS `.app`, a Linux
 * `.desktop` entry, a Windows shortcut) rather than from a terminal, it inherits
 * a *minimal* `PATH` — the user's shell rc files never run, so Homebrew,
 * `/usr/local/bin`, `~/.local/bin`, `/snap/bin`, etc. are absent. Tools the user
 * installed and uses daily in their terminal (notably `gh`, but also `git`,
 * `node`, `docker`) then appear "not found" to the app even though they exist.
 *
 * We fix this once at startup by merging the interactive login shell's PATH and
 * a set of well-known bin dirs into `process.env.PATH`. Every later `spawn`
 * (gh in git.ts, the agent's host command executor, editor launch, the docker
 * CLI lookup) inherits the corrected value automatically.
 */

const MARK = '__hx_path_b91c__'

/** Common bin directories a login shell would normally add but a GUI launch omits. */
function commonBinDirs(): string[] {
  const home = homedir()
  return [
    '/usr/local/bin',
    '/usr/local/sbin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/bin',
    '/usr/sbin',
    '/bin',
    '/sbin',
    '/snap/bin',
    '/home/linuxbrew/.linuxbrew/bin',
    '/home/linuxbrew/.linuxbrew/sbin',
    join(home, '.linuxbrew', 'bin'),
    join(home, '.local', 'bin'),
    join(home, 'bin'),
    join(home, '.cargo', 'bin'),
    join(home, 'go', 'bin')
  ]
}

/**
 * Resolve the PATH a user gets in their interactive login shell. Returns null on
 * Windows (GUI processes there inherit the full system/user PATH already) or when
 * the shell can't be queried. The value is delimited with a sentinel so any noise
 * an rc file prints to stdout is discarded.
 */
export function loginShellPath(
  run: (shell: string) => string | null = defaultShellQuery
): string | null {
  if (process.platform === 'win32') return null
  const shell = process.env.SHELL || '/bin/bash'
  const out = run(shell)
  if (!out) return null
  const i = out.indexOf(MARK)
  const j = i === -1 ? -1 : out.indexOf(MARK, i + MARK.length)
  if (i === -1 || j === -1) return null
  return out.slice(i + MARK.length, j) || null
}

function defaultShellQuery(shell: string): string | null {
  try {
    // `${PATH}` must be brace-delimited: the sentinel chars are valid identifier
    // characters, so a bare `$PATH${MARK}` would parse as one undefined variable.
    const r = spawnSync(shell, ['-ilc', `printf '%s' "${MARK}\${PATH}${MARK}"`], {
      encoding: 'utf-8',
      timeout: 5000
    })
    return r.stdout ?? null
  } catch {
    return null
  }
}

/**
 * Merge several `PATH`-like strings (and individual dirs) into one, preserving
 * first-seen order and dropping duplicates and empties. Pure — the unit-tested
 * core of {@link augmentProcessPath}.
 */
export function mergePaths(...sources: Array<string | null | undefined>): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const src of sources) {
    if (!src) continue
    for (const raw of src.split(delimiter)) {
      const dir = raw.trim()
      if (dir && !seen.has(dir)) {
        seen.add(dir)
        out.push(dir)
      }
    }
  }
  return out.join(delimiter)
}

/**
 * Augment `process.env.PATH` in place so GUI-launched processes can find
 * user-installed CLIs (#195). Idempotent: the existing PATH always comes first,
 * so re-running only ever appends still-missing dirs. No-op effect on the order
 * of dirs already present.
 */
export function augmentProcessPath(): void {
  const merged = mergePaths(
    process.env.PATH,
    loginShellPath(),
    ...(process.platform === 'win32' ? [] : commonBinDirs())
  )
  if (merged) process.env.PATH = merged
}
