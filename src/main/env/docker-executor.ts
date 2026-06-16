import { spawn as nodeSpawn } from 'node:child_process'
import type { ChildProcessLike, CommandExecutor, ExecutorSpawnOptions } from '@harnext/core'

/**
 * Build the `docker exec` argv that runs `command` inside `container` at the
 * container-side working dir `cwd`. Pure + exported so the command construction
 * is unit-testable without spawning docker (#176).
 *
 * `-i` keeps stdin open for the foreground bash tool; `-w` runs in the
 * bind-mount target (passed as execCwd); `sh -c` executes the command string.
 * The host env is intentionally not forwarded — the container owns its own.
 */
export function dockerExecArgs(container: string, cwd: string, command: string): string[] {
  return ['exec', '-i', '-w', cwd, container, 'sh', '-c', command]
}

/** Injectable spawn seam so the executor's behaviour is unit-testable (#176). */
export type SpawnFn = (
  cmd: string,
  args: string[],
  options: { stdio: ['ignore', 'pipe', 'pipe'] }
) => ChildProcessLike

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
    private readonly teardown: () => Promise<void>,
    /** Spawn implementation — defaults to node's; injected in tests. */
    private readonly spawnFn: SpawnFn = nodeSpawn as unknown as SpawnFn
  ) {}

  spawn(command: string, opts: ExecutorSpawnOptions): ChildProcessLike {
    // `-w` runs in the container-side working dir (the bind-mount target, passed
    // as execCwd). The host env is never forwarded — the container owns its own.
    const child = this.spawnFn('docker', dockerExecArgs(this.container, opts.cwd, command), {
      stdio: ['ignore', 'pipe', 'pipe']
    })
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
