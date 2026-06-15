import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorktree, listBranches, currentBranch } from './git'

/**
 * Integration test for #97 (base-branch worktrees): build a throwaway git repo
 * with `main` and `develop` diverged, then assert listBranches sees both and
 * createWorktree branches off whichever ref it's given (default still = HEAD).
 */
const git = (cwd: string, ...args: string[]): void => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
}

let root: string
let repo: string
let wtRoot: string

describe('git base-branch worktrees (#97)', () => {
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'harnext-git-'))
    repo = join(root, 'repo')
    wtRoot = join(root, 'worktrees')
    mkdirSync(repo, { recursive: true })
    git(repo, 'init', '-q')
    git(repo, 'config', 'user.email', 't@t.local')
    git(repo, 'config', 'user.name', 'Tester')
    git(repo, 'config', 'commit.gpgsign', 'false')
    writeFileSync(join(repo, 'main.txt'), 'main')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-qm', 'init')
    git(repo, 'branch', '-M', 'main')
    // A diverged develop branch with a file that main doesn't have.
    git(repo, 'checkout', '-q', '-b', 'develop')
    writeFileSync(join(repo, 'dev.txt'), 'dev')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-qm', 'dev work')
    git(repo, 'checkout', '-q', 'main')
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('lists local branches with the current one, minus agent/* noise', () => {
    const b = listBranches(repo)
    expect(b.current).toBe('main')
    expect(b.local.sort()).toEqual(['develop', 'main'])
  })

  it('branches a worktree off the chosen ref (develop)', () => {
    const wt = createWorktree(repo, 'base-off-develop', 'aaaaaa', wtRoot, 'develop')
    expect(wt.branch).toBe('agent/base-off-develop')
    expect(currentBranch(wt.path)).toBe('agent/base-off-develop')
    // It came from develop, so develop's exclusive file is present.
    expect(existsSync(join(wt.path, 'dev.txt'))).toBe(true)
    expect(readFileSync(join(wt.path, 'main.txt'), 'utf-8')).toBe('main')
  })

  it('defaults to HEAD when no base ref is given (today’s behaviour)', () => {
    // HEAD is main, which does not have dev.txt.
    const wt = createWorktree(repo, 'base-off-head', 'bbbbbb', wtRoot)
    expect(existsSync(join(wt.path, 'dev.txt'))).toBe(false)
    expect(existsSync(join(wt.path, 'main.txt'))).toBe(true)
  })
})
