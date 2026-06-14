import { spawn } from 'node:child_process'
import type { ChildProcessLike, CommandExecutor, ExecutorSpawnOptions } from '@harnext/core'

/**
 * Routes the agent's shell commands into a per-worktree container via
 * `docker exec`, instead of running them on the host. Passed to
 * `createAgentSession({ executor })`; `read`/`edit`/`write` stay on the host
 * (the worktree is bind-mounted, so the container sees the same files). Both the
 * foreground `bash` tool and background shells go through this one instance.
 */
export class DockerExecutor implements CommandExecutor {
  constructor(
    /** Workspace container id the commands exec into. */
    private readonly container: string,
    /** Tears the sandbox down; awaited from `AgentSession.dispose()`. Idempotent. */
    private readonly teardown: () => Promise<void>
  ) {}

  spawn(command: string, opts: ExecutorSpawnOptions): ChildProcessLike {
    // `-w` runs in the container-side working dir (the bind-mount target, passed
    // as execCwd). The host env is never forwarded — the container owns its own.
    const child = spawn(
      'docker',
      ['exec', '-i', '-w', opts.cwd, this.container, 'sh', '-c', command],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )
    if (opts.signal) {
      const signal = opts.signal
      const onAbort = (): void => {
        child.kill('SIGTERM')
      }
      if (signal.aborted) onAbort()
      else {
        signal.addEventListener('abort', onAbort, { once: true })
        child.on('close', () => signal.removeEventListener('abort', onAbort))
      }
    }
    return child
  }

  dispose(): Promise<void> {
    return this.teardown()
  }
}
