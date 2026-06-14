import { spawn, spawnSync } from 'node:child_process'

export const EDITORS = [
  'VS Code',
  'Cursor',
  'Zed',
  'Windsurf',
  'Neovim',
  'JetBrains',
  'Sublime Text'
]

type Cmd = { file: string; args: string[]; shell?: boolean }
type Launcher = (path: string) => Cmd

// A GUI editor that ships a PATH launcher on Linux/Windows and a .app on macOS.
// - linux: the PATH binary (e.g. `code`).
// - darwin: `open -a "<App>" <path>` — `open` is always present and resolves the
//   app by name, so terminal CLIs (which often aren't installed on mac) aren't needed.
// - win32: the `.cmd`/`.exe` shim. Node refuses to spawn a `.cmd` without a shell
//   (EINVAL since the 2024 security change), so these launch with `shell: true`.
function gui(linuxBin: string, macApp: string, winBin: string): Record<string, Launcher> {
  return {
    linux: (p) => ({ file: linuxBin, args: [p] }),
    darwin: (p) => ({ file: 'open', args: ['-a', macApp, p] }),
    win32: (p) => ({ file: winBin, args: [p], shell: true })
  }
}

// Per-editor, per-platform launchers. `process.platform` selects the row.
const LAUNCHERS: Record<string, Record<string, Launcher>> = {
  'VS Code': gui('code', 'Visual Studio Code', 'code.cmd'),
  Cursor: gui('cursor', 'Cursor', 'cursor.cmd'),
  Zed: gui('zed', 'Zed', 'zed.exe'),
  Windsurf: gui('windsurf', 'Windsurf', 'windsurf.cmd'),
  JetBrains: gui('idea', 'IntelliJ IDEA', 'idea.cmd'),
  'Sublime Text': gui('subl', 'Sublime Text', 'subl.exe'),
  // Terminal editor: needs a terminal host, which differs per OS.
  Neovim: {
    linux: (p) => ({ file: 'x-terminal-emulator', args: ['-e', 'nvim', p] }),
    // Run nvim inside Terminal.app via AppleScript (no reliable one-liner otherwise).
    darwin: (p) => ({
      file: 'osascript',
      args: [
        '-e',
        `tell app "Terminal" to do script "nvim " & quoted form of "${p}"`,
        '-e',
        'tell app "Terminal" to activate'
      ]
    }),
    // `start` opens a fresh console window; the empty "" is its required title arg.
    win32: (p) => ({ file: 'cmd', args: ['/c', 'start', '', 'nvim', p] })
  }
}

/** Whether `file` resolves to a runnable command on this machine's PATH. */
function commandExists(file: string): boolean {
  // `open`/`cmd`/`osascript` are OS built-ins that are always present.
  if (file === 'open' || file === 'cmd' || file === 'osascript') return true
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const r = spawnSync(probe, [file], { stdio: 'ignore' })
  return r.status === 0
}

/** Resolve the spawn command for an editor on a platform (exported for tests). */
export function resolveCommand(editor: string, platform: string, path: string): Cmd | null {
  const row = LAUNCHERS[editor] ?? LAUNCHERS['VS Code']
  const make = row[platform] ?? row.linux
  return make ? make(path) : null
}

export function openInEditor(editor: string, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = resolveCommand(editor, process.platform, path)
    if (!cmd) {
      reject(new Error(`Don't know how to open ${editor} on ${process.platform}.`))
      return
    }
    if (!commandExists(cmd.file)) {
      reject(
        new Error(
          `Could not launch ${editor}: "${cmd.file}" was not found on your PATH. ` +
            `Make sure ${editor} is installed and its command-line launcher is available.`
        )
      )
      return
    }
    // With shell:true (Windows .cmd shims) args are re-parsed by cmd.exe, so quote
    // any that contain spaces — otherwise a path like "C:\My Project" splits apart.
    const args = cmd.shell ? cmd.args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : cmd.args
    const child = spawn(cmd.file, args, {
      detached: true,
      stdio: 'ignore',
      shell: cmd.shell ?? false
    })
    child.on('error', (err) => reject(new Error(`Could not launch ${editor}: ${err.message}`)))
    child.on('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
