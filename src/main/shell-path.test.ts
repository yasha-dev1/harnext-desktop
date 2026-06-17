import { describe, it, expect, vi } from 'vitest'
import { extractPath, mergePath, resolveShellPath, applyShellPath } from './shell-path'

describe('extractPath — recover PATH from delimited shell output', () => {
  it('extracts the PATH between the delimiters', () => {
    const out = '__HARNEXT_PATH__/opt/homebrew/bin:/usr/bin__HARNEXT_PATH__'
    expect(extractPath(out)).toBe('/opt/homebrew/bin:/usr/bin')
  })

  it('ignores profile banners printed before/after the markers', () => {
    const out = 'Welcome!\n__HARNEXT_PATH__/usr/local/bin:/bin__HARNEXT_PATH__\n[mise] activated'
    expect(extractPath(out)).toBe('/usr/local/bin:/bin')
  })

  it('returns null when the delimiter is missing', () => {
    expect(extractPath('/usr/bin:/bin')).toBeNull()
  })

  it('returns null when the bracketed PATH is empty', () => {
    expect(extractPath('__HARNEXT_PATH____HARNEXT_PATH__')).toBeNull()
  })
})

describe('mergePath — resolved entries win, deduped, order preserved', () => {
  it('puts resolved entries first, then the current ones', () => {
    expect(mergePath('/opt/homebrew/bin:/usr/local/bin', '/usr/bin:/bin')).toBe(
      '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'
    )
  })

  it('dedupes entries already present in the current PATH', () => {
    expect(mergePath('/opt/homebrew/bin:/usr/bin', '/usr/bin:/bin')).toBe(
      '/opt/homebrew/bin:/usr/bin:/bin'
    )
  })

  it('drops empty segments and trims whitespace', () => {
    expect(mergePath('/a:: /b ', '/a:')).toBe('/a:/b')
  })

  it('handles an empty current PATH', () => {
    expect(mergePath('/opt/homebrew/bin', '')).toBe('/opt/homebrew/bin')
  })
})

describe('resolveShellPath — login-shell PATH lookup with guards', () => {
  it('runs the user shell as an interactive login shell and returns its PATH', () => {
    const exec = vi.fn(() => '__HARNEXT_PATH__/opt/homebrew/bin:/usr/bin__HARNEXT_PATH__')
    const got = resolveShellPath({ platform: 'darwin', env: { SHELL: '/bin/zsh' }, exec })
    expect(got).toBe('/opt/homebrew/bin:/usr/bin')
    expect(exec).toHaveBeenCalledWith('/bin/zsh', [
      '-ilc',
      'printf %s "__HARNEXT_PATH__${PATH}__HARNEXT_PATH__"'
    ])
  })

  it('returns null on Windows without invoking a shell', () => {
    const exec = vi.fn()
    expect(resolveShellPath({ platform: 'win32', env: { SHELL: '/bin/zsh' }, exec })).toBeNull()
    expect(exec).not.toHaveBeenCalled()
  })

  it('returns null when $SHELL is unset', () => {
    const exec = vi.fn()
    expect(resolveShellPath({ platform: 'linux', env: {}, exec })).toBeNull()
    expect(exec).not.toHaveBeenCalled()
  })

  it('returns null (never throws) when the shell invocation fails', () => {
    const exec = vi.fn(() => {
      throw new Error('shell exploded')
    })
    expect(resolveShellPath({ platform: 'darwin', env: { SHELL: '/bin/zsh' }, exec })).toBeNull()
  })
})

describe('applyShellPath — fold the resolved PATH into env in place', () => {
  it('merges the resolved PATH ahead of the existing one and returns true', () => {
    const env: NodeJS.ProcessEnv = { SHELL: '/bin/zsh', PATH: '/usr/bin:/bin' }
    const exec = (): string => '__HARNEXT_PATH__/opt/homebrew/bin:/usr/bin__HARNEXT_PATH__'
    expect(applyShellPath({ platform: 'darwin', env, exec })).toBe(true)
    expect(env.PATH).toBe('/opt/homebrew/bin:/usr/bin:/bin')
  })

  it('leaves PATH untouched and returns false when nothing resolves', () => {
    const env: NodeJS.ProcessEnv = { SHELL: '/bin/zsh', PATH: '/usr/bin:/bin' }
    const exec = (): string => 'no markers here'
    expect(applyShellPath({ platform: 'darwin', env, exec })).toBe(false)
    expect(env.PATH).toBe('/usr/bin:/bin')
  })

  it('is a no-op on Windows', () => {
    const env: NodeJS.ProcessEnv = { SHELL: '/bin/zsh', PATH: 'C:\\Windows' }
    expect(applyShellPath({ platform: 'win32', env, exec: vi.fn() })).toBe(false)
    expect(env.PATH).toBe('C:\\Windows')
  })
})
