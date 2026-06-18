import { execFileSync } from 'node:child_process'

/**
 * Recover the user's real PATH for GUI launches.
 *
 * When harnext is started from the dock/launcher (not a terminal) on macOS or
 * Linux, the process inherits a minimal system PATH — it does NOT include the
 * entries a login shell would add (Homebrew's `/opt/homebrew/bin`, `/usr/local/bin`,
 * `~/.local/bin`, and version-manager shims like asdf/mise/volta/nvm). The agent's
 * bash tool then can't find tools the user clearly has installed — e.g. `gh` —
 * even though they work in their terminal (#195). We fix this by asking the user's
 * login+interactive shell to print its PATH at startup and merging it in.
 *
 * Windows GUI processes already inherit the user PATH, so this is a no-op there.
 */

// Bracket the PATH so we can recover it even if the user's profile prints banners.
const DELIM = '__HARNEXT_PATH__'

/** Pull the PATH out from between the two delimiters; null if absent/empty. */
export function extractPath(stdout: string, delim = DELIM): string | null {
  const start = stdout.indexOf(delim)
  if (start < 0) return null
  const end = stdout.indexOf(delim, start + delim.length)
  if (end < 0) return null
  const path = stdout.slice(start + delim.length, end)
  return path.trim() ? path : null
}

/**
 * Merge a freshly-resolved login-shell PATH into the current process PATH.
 * Resolved entries come first (so the user's tools win over Electron's minimal
 * GUI PATH), the existing entries follow, all deduped with order preserved.
 * Pure + exported for tests.
 */
export function mergePath(resolved: string, current: string, sep = ':'): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of [...resolved.split(sep), ...current.split(sep)]) {
    const p = part.trim()
    if (!p || seen.has(p)) continue
    seen.add(p)
    out.push(p)
  }
  return out.join(sep)
}

export interface ShellPathDeps {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  /** Injectable shell runner (returns stdout). Defaults to a real login shell. */
  exec?: (shell: string, args: string[]) => string
}

function defaultExec(shell: string, args: string[]): string {
  return execFileSync(shell, args, {
    encoding: 'utf8',
    timeout: 3000,
    windowsHide: true,
    // A login+interactive shell may read from stdin; deny it and drop its stderr
    // (profile banners/warnings) so only our delimited PATH reaches stdout.
    stdio: ['ignore', 'pipe', 'ignore']
  })
}

/**
 * Ask the user's login+interactive shell for its PATH. Returns null on Windows,
 * when `$SHELL` is unset, or on any failure (a missing/odd shell must never block
 * startup). Pure aside from the injected `exec`.
 */
export function resolveShellPath(deps: ShellPathDeps): string | null {
  const { platform, env } = deps
  if (platform === 'win32') return null
  const shell = env.SHELL
  if (!shell) return null
  const exec = deps.exec ?? defaultExec
  try {
    // `-ilc` = interactive login shell, so it sources BOTH the login profiles
    // (.zprofile/.bash_profile — where Homebrew/asdf put PATH) AND the interactive
    // rc files (.zshrc/.bashrc — where many users export PATH instead). `${PATH}`
    // is braced so the trailing delimiter isn't parsed as part of the var name;
    // printf avoids echo's trailing newline.
    const stdout = exec(shell, ['-ilc', `printf %s "${DELIM}\${PATH}${DELIM}"`])
    return extractPath(stdout)
  } catch {
    return null
  }
}

/**
 * Resolve the login-shell PATH and fold it into `deps.env.PATH` in place.
 * Returns true when the PATH was updated, false when there was nothing to do
 * (Windows, no `$SHELL`, or resolution failed). Safe to call unconditionally
 * at startup — merging is idempotent.
 */
export function applyShellPath(deps: ShellPathDeps): boolean {
  const resolved = resolveShellPath(deps)
  if (!resolved) return false
  deps.env.PATH = mergePath(resolved, deps.env.PATH ?? '')
  return true
}
