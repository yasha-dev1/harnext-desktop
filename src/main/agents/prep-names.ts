// Parse + clean the cheap-model "prepare step" response that names a new
// conversation: a concise title and a git branch name, asked for together in
// one call (#114). Pure, so the parsing is unit-testable.

export interface PrepNames {
  /** Concise human title for the conversation ('' when the model gave nothing usable). */
  title: string
  /** Suggested branch name (loose; createWorktree slugifies it), or null. */
  branchName: string | null
}

/** Tidy a model-suggested title: strip quotes/markdown/"Title:" noise, one line, capped. */
export function cleanTitle(raw: string): string {
  return raw
    .split('\n')[0]
    .replace(/^\s*title:\s*/i, '')
    .replace(/^["'`*#\s]+|["'`*\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70)
}

/** Tidy a model-suggested branch name (createWorktree slugifies further). */
export function cleanBranchName(raw: string): string {
  return raw
    .split('\n')[0]
    .replace(/^\s*branch(\s*name)?:\s*/i, '')
    .replace(/^(agent|feature|feat)\//i, '')
    .replace(/["'`*]/g, '')
    .trim()
}

/**
 * Sanitized branch-name source from the raw prompt, used when the prep call
 * fails/times out (#114, point 3). Strips URLs first so a URL-heavy prompt can't
 * slugify into `https-github-com-…`; keeps the first few real words as a short
 * human slug (createWorktree slugifies further). Falls back to `task` when the
 * prompt is nothing but a URL.
 */
export function fallbackBranchFromPrompt(prompt: string): string {
  const words = prompt
    .replace(/https?:\/\/\S+/gi, ' ') // drop URLs
    .replace(/\bwww\.\S+/gi, ' ') // drop bare www links
    .replace(/[^A-Za-z0-9\s-]+/g, ' ') // drop punctuation/symbols
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 6)
    .join(' ')
  return words || 'task'
}

/**
 * Pull the title + branch name out of the model's response. Prefers explicit
 * `Title:` / `Branch:` labels; otherwise the first non-empty line is the title.
 * Either field may come back empty — the caller falls back to the prompt.
 */
export function parsePrepNames(text: string): PrepNames {
  const lines = text.split('\n')
  const labelled = (re: RegExp): string => {
    for (const l of lines) {
      const m = l.match(re)
      if (m) return m[1]
    }
    return ''
  }

  let title = labelled(/^\s*title:\s*(.+)$/i)
  if (!title) {
    // Unlabelled: the first non-empty, non-"branch:" line is the title.
    title = lines.map((l) => l.trim()).find((l) => l && !/^branch(?:\s*name)?:/i.test(l)) ?? ''
  }
  const branch = labelled(/^\s*branch(?:\s*name)?:\s*(.+)$/i)

  const cleanedTitle = cleanTitle(title)
  const cleanedBranch = cleanBranchName(branch)
  return { title: cleanedTitle, branchName: cleanedBranch || null }
}
