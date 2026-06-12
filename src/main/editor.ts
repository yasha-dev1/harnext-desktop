import { spawn } from 'node:child_process'

export const EDITORS = [
  'VS Code',
  'Cursor',
  'Zed',
  'Windsurf',
  'Neovim',
  'JetBrains',
  'Sublime Text'
]

const COMMANDS: Record<string, string[]> = {
  'VS Code': ['code'],
  Cursor: ['cursor'],
  Zed: ['zed'],
  Windsurf: ['windsurf'],
  Neovim: ['x-terminal-emulator', '-e', 'nvim'],
  JetBrains: ['idea'],
  'Sublime Text': ['subl']
}

export function openInEditor(editor: string, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = COMMANDS[editor] ?? COMMANDS['VS Code']
    const child = spawn(cmd[0], [...cmd.slice(1), path], { detached: true, stdio: 'ignore' })
    child.on('error', (err) => reject(new Error(`Could not launch ${editor}: ${err.message}`)))
    child.on('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
