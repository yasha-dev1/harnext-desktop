import { describe, it, expect } from 'vitest'
import { resolveCommand, EDITORS } from './editor'

const PATH = '/Users/me/My Project'
const cmdString = (editor: string, platform: string): string => {
  const c = resolveCommand(editor, platform, PATH)
  return c ? `${c.file} ${c.args.join(' ')}`.trim() : 'null'
}

describe('resolveCommand — per-platform launchers (issue #47)', () => {
  it('Windows uses .cmd/.exe shims spawned through a shell', () => {
    const c = resolveCommand('VS Code', 'win32', PATH)
    expect(c).toEqual({ file: 'code.cmd', args: [PATH], shell: true })
    expect(resolveCommand('Sublime Text', 'win32', PATH)?.file).toBe('subl.exe')
  })

  it('macOS launches GUI editors by app name via `open -a`', () => {
    expect(cmdString('VS Code', 'darwin')).toBe(`open -a Visual Studio Code ${PATH}`)
    expect(cmdString('JetBrains', 'darwin')).toBe(`open -a IntelliJ IDEA ${PATH}`)
    // `open` needs no shell — args are passed through verbatim.
    expect(resolveCommand('VS Code', 'darwin', PATH)?.shell).toBeUndefined()
  })

  it('Linux keeps the original PATH binaries (no regression)', () => {
    expect(cmdString('VS Code', 'linux')).toBe(`code ${PATH}`)
    expect(cmdString('Neovim', 'linux')).toBe(`x-terminal-emulator -e nvim ${PATH}`)
  })

  it('the terminal editor (Neovim) gets a per-OS terminal host', () => {
    expect(resolveCommand('Neovim', 'win32', PATH)?.file).toBe('cmd')
    expect(resolveCommand('Neovim', 'win32', PATH)?.args).toEqual(['/c', 'start', '', 'nvim', PATH])
    expect(resolveCommand('Neovim', 'darwin', PATH)?.file).toBe('osascript')
  })

  it('an unknown editor falls back to the VS Code launcher for that platform', () => {
    expect(resolveCommand('Emacs', 'win32', PATH)?.file).toBe('code.cmd')
    expect(cmdString('Emacs', 'linux')).toBe(`code ${PATH}`)
  })

  it('an unknown platform falls back to the Linux launcher', () => {
    expect(cmdString('VS Code', 'freebsd')).toBe(`code ${PATH}`)
  })

  it('every advertised editor resolves on every supported platform', () => {
    for (const ed of EDITORS) {
      for (const p of ['win32', 'darwin', 'linux']) {
        expect(resolveCommand(ed, p, PATH), `${ed} on ${p}`).not.toBeNull()
      }
    }
  })
})
