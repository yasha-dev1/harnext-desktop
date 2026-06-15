import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { BranchList, DiffFile, DiffHunk, DiffLine, WorktreeDiff } from '../shared/types'

export function runGit(
  args: string[],
  cwd: string
): { exit: number; stdout: string; stderr: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
  return {
    exit: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? (r.error ? r.error.message : '')
  }
}

/**
 * True only when `path` is the *top level* of a git repo. A folder merely
 * nested inside a repo is not treated as git, so we never create agent
 * worktrees rooted at an ancestor repo the user didn't open (see #46).
 */
export function isGitRepo(path: string): boolean {
  const top = runGit(['rev-parse', '--show-toplevel'], path)
  if (top.exit !== 0 || !top.stdout.trim()) return false
  try {
    return realpathSync(top.stdout.trim()) === realpathSync(path)
  } catch {
    return false
  }
}

export function currentBranch(path: string): string | null {
  const r = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], path)
  return r.exit === 0 ? r.stdout.trim() : null
}

// ── remote / pull requests ───────────────────────────────────────────

/** Whether the repo has the named remote (default `origin`). */
export function hasRemote(path: string, name = 'origin'): boolean {
  return runGit(['remote'], path)
    .stdout.split('\n')
    .map((s) => s.trim())
    .includes(name)
}

/** Best-effort `git fetch --prune` (network, so time-boxed); errors are ignored. */
export function fetchRemote(path: string, name = 'origin'): void {
  if (!hasRemote(path, name)) return
  spawnSync('git', ['fetch', '--prune', name], { cwd: path, encoding: 'utf-8', timeout: 15000 })
}

/**
 * Local + remote branches a new agent can be based on. Agent worktree branches
 * (`agent/*`) and `origin/HEAD` are filtered out as noise.
 */
export function listBranches(path: string): BranchList {
  const refs = (pattern: string): string[] =>
    runGit(['for-each-ref', '--format=%(refname:short)', pattern], path)
      .stdout.split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  const local = refs('refs/heads').filter((b) => !b.startsWith('agent/'))
  const remote = refs('refs/remotes').filter((b) => !b.endsWith('/HEAD'))
  return { current: currentBranch(path), local, remote }
}

/** The remote's default branch (origin/HEAD), falling back to main/master/HEAD. */
export function defaultBaseBranch(path: string): string {
  const head = runGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], path)
  if (head.exit === 0 && head.stdout.trim()) return head.stdout.trim().replace(/^origin\//, '')
  for (const b of ['main', 'master']) {
    if (runGit(['rev-parse', '--verify', `origin/${b}`], path).exit === 0) return b
  }
  return currentBranch(path) ?? 'main'
}

/** Commit any pending worktree changes onto the current branch (no-op if clean). */
export function commitWorktree(worktreePath: string, message: string): void {
  runGit(['add', '-A'], worktreePath)
  if (runGit(['status', '--porcelain'], worktreePath).stdout.trim().length === 0) return
  const c = runGit(
    ['-c', 'user.name=harnext', '-c', 'user.email=agent@harnext.local', 'commit', '-m', message],
    worktreePath
  )
  if (c.exit !== 0) throw new Error(`commit failed: ${c.stderr.trim() || c.stdout.trim()}`)
}

/** Push a branch to origin and set upstream. */
export function pushBranch(path: string, branch: string): void {
  const r = runGit(['push', '-u', 'origin', branch], path)
  if (r.exit !== 0) throw new Error(`git push failed: ${r.stderr.trim() || r.stdout.trim()}`)
}

function runGh(args: string[], cwd: string): { exit: number; stdout: string; stderr: string } {
  const r = spawnSync('gh', args, { cwd, encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 })
  if (r.error && (r.error as NodeJS.ErrnoException).code === 'ENOENT') {
    throw new Error(
      'GitHub CLI (gh) not found. Install gh and run `gh auth login` to open pull requests.'
    )
  }
  return { exit: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

/** Open a PR for `branch` against `base` via the gh CLI; returns the PR URL. */
export function createPullRequest(
  path: string,
  opts: { branch: string; base: string; title: string; body: string }
): string {
  const r = runGh(
    [
      'pr',
      'create',
      '--base',
      opts.base,
      '--head',
      opts.branch,
      '--title',
      opts.title,
      '--body',
      opts.body
    ],
    path
  )
  const out = `${r.stdout}\n${r.stderr}`
  const url = out.match(/https:\/\/github\.com\/\S+\/pull\/\d+/)
  // gh prints the existing PR URL (and a non-zero exit) when one already exists.
  if (url) return url[0]
  if (r.exit !== 0) throw new Error(`gh pr create failed: ${(r.stderr || r.stdout).trim()}`)
  throw new Error(`gh pr create returned no PR URL: ${r.stdout.trim()}`)
}

// ── worktrees ────────────────────────────────────────────────────────

export const DEFAULT_WORKTREE_ROOT = join(homedir(), '.harnext-desktop', 'worktrees')

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .split('-')
      .slice(0, 4)
      .join('-') || 'task'
  )
}

export interface WorktreeInfo {
  path: string
  branch: string
}

function branchExists(projectPath: string, branch: string): boolean {
  return runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], projectPath).exit === 0
}

/**
 * Create an isolated worktree for an agent under ~/.harnext-desktop/worktrees/,
 * based on the project's current HEAD. The user's working copy is never
 * touched. `name` is the desired branch name (e.g. one suggested by the model);
 * it's slugified to `agent/<slug>` and only disambiguated with a short id
 * suffix when that branch or worktree dir already exists.
 */
export function createWorktree(
  projectPath: string,
  name: string,
  agentId: string,
  root: string = DEFAULT_WORKTREE_ROOT,
  // Ref the worktree branches off — a local branch, a remote-tracking branch
  // (`origin/develop`), or any commit-ish. Defaults to the project's HEAD.
  baseRef: string = 'HEAD'
): WorktreeInfo {
  const base = slugify(name)
  const collides = (slug: string): boolean =>
    existsSync(join(root, slug)) || branchExists(projectPath, `agent/${slug}`)
  const slug = collides(base) ? `${base}-${agentId.slice(0, 6)}` : base
  const branch = `agent/${slug}`
  const path = join(root, slug)
  mkdirSync(root, { recursive: true })
  const r = runGit(['worktree', 'add', '-b', branch, path, baseRef || 'HEAD'], projectPath)
  if (r.exit !== 0) {
    throw new Error(`git worktree add failed: ${r.stderr.trim() || 'exit ' + r.exit}`)
  }
  return { path, branch }
}

export function removeWorktree(
  projectPath: string,
  worktreePath: string,
  branch: string | null
): void {
  runGit(['worktree', 'remove', '--force', worktreePath], projectPath)
  try {
    rmSync(worktreePath, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
  if (branch) runGit(['branch', '-D', branch], projectPath)
  runGit(['worktree', 'prune'], projectPath)
}

/**
 * Commit everything in the worktree and merge its branch into the project's
 * checked-out branch. Throws with git's stderr when the merge fails.
 */
export function mergeWorktree(
  projectPath: string,
  worktreePath: string,
  branch: string,
  title: string
): void {
  runGit(['add', '-A'], worktreePath)
  const status = runGit(['status', '--porcelain'], worktreePath)
  if (status.stdout.trim().length > 0) {
    const commit = runGit(
      ['-c', 'user.name=harnext', '-c', 'user.email=agent@harnext.local', 'commit', '-m', title],
      worktreePath
    )
    if (commit.exit !== 0) {
      throw new Error(`commit failed: ${commit.stderr.trim() || commit.stdout.trim()}`)
    }
  }
  const merge = runGit(['merge', '--no-ff', '-m', `agent: ${title}`, branch], projectPath)
  if (merge.exit !== 0) {
    runGit(['merge', '--abort'], projectPath)
    throw new Error(`merge failed: ${merge.stderr.trim() || merge.stdout.trim()}`)
  }
}

// ── diff parsing ─────────────────────────────────────────────────────

/**
 * Full worktree diff vs HEAD, untracked files included (via intent-to-add,
 * which `git diff` then sees without actually staging content).
 */
export function worktreeDiff(worktreePath: string): WorktreeDiff {
  runGit(['add', '-N', '-A'], worktreePath)
  const r = runGit(['diff', 'HEAD'], worktreePath)
  if (r.exit !== 0 && !r.stdout) return { files: [], add: 0, del: 0 }
  return parseUnifiedDiff(r.stdout)
}

export function parseUnifiedDiff(text: string): WorktreeDiff {
  const files: DiffFile[] = []
  let file: DiffFile | null = null
  let hunk: DiffHunk | null = null
  let oldNo = 0
  let newNo = 0

  const pushFile = (): void => {
    if (file) files.push(file)
    file = null
    hunk = null
  }

  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      pushFile()
      // diff --git a/path b/path — take the b-side path
      const m = line.match(/ b\/(.+)$/)
      file = { path: m ? m[1] : line.slice(11), badge: 'mod', add: 0, del: 0, hunks: [] }
      continue
    }
    if (!file) continue
    if (line.startsWith('new file mode')) {
      file.badge = 'new'
      continue
    }
    if (line.startsWith('deleted file mode')) {
      file.badge = 'del'
      continue
    }
    if (line.startsWith('@@')) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      oldNo = m ? parseInt(m[1], 10) : 1
      newNo = m ? parseInt(m[2], 10) : 1
      hunk = { label: line.match(/^(@@[^@]*@@)/)?.[1] ?? line, lines: [] }
      file.hunks.push(hunk)
      continue
    }
    if (!hunk) continue
    if (line.startsWith('+')) {
      hunk.lines.push({ t: 'add', o: null, n: newNo++, c: line.slice(1) })
      file.add++
    } else if (line.startsWith('-')) {
      hunk.lines.push({ t: 'del', o: oldNo++, n: null, c: line.slice(1) })
      file.del++
    } else if (line.startsWith(' ')) {
      hunk.lines.push({ t: 'ctx', o: oldNo++, n: newNo++, c: line.slice(1) })
    }
    // Empty tokens (trailing newline from split), '\ No newline at end of
    // file', and headers (---/+++) are skipped — git prefixes real context
    // lines (even blank ones) with a leading space.
  }
  pushFile()

  const add = files.reduce((s, f) => s + f.add, 0)
  const del = files.reduce((s, f) => s + f.del, 0)
  return { files, add, del }
}

/** Build the same DiffFile shape from stored snapshot patches (non-git projects). */
export function diffFromSnapshots(
  changes: {
    path: string
    diff: string
    additions: number
    deletions: number
    before_content: string | null
  }[]
): WorktreeDiff {
  // Latest change per file wins for the badge; hunks accumulate chronologically.
  const byFile = new Map<string, DiffFile>()
  for (const c of changes) {
    const parsed = parsePatchHunks(c.diff)
    let f = byFile.get(c.path)
    if (!f) {
      f = {
        path: c.path,
        badge: c.before_content === null ? 'new' : 'mod',
        add: 0,
        del: 0,
        hunks: []
      }
      byFile.set(c.path, f)
    }
    f.add += c.additions
    f.del += c.deletions
    f.hunks.push(...parsed)
  }
  const files = [...byFile.values()]
  return {
    files,
    add: files.reduce((s, f) => s + f.add, 0),
    del: files.reduce((s, f) => s + f.del, 0)
  }
}

function parsePatchHunks(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let hunk: DiffHunk | null = null
  let oldNo = 0
  let newNo = 0
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      oldNo = m ? parseInt(m[1], 10) : 1
      newNo = m ? parseInt(m[2], 10) : 1
      hunk = { label: line.match(/^(@@[^@]*@@)/)?.[1] ?? line, lines: [] }
      hunks.push(hunk)
      continue
    }
    if (!hunk) continue
    if (line.startsWith('+++') || line.startsWith('---')) continue
    let l: DiffLine | null = null
    if (line.startsWith('+')) l = { t: 'add', o: null, n: newNo++, c: line.slice(1) }
    else if (line.startsWith('-')) l = { t: 'del', o: oldNo++, n: null, c: line.slice(1) }
    else if (line.startsWith(' ')) l = { t: 'ctx', o: oldNo++, n: newNo++, c: line.slice(1) }
    if (l) hunk.lines.push(l)
  }
  return hunks
}
