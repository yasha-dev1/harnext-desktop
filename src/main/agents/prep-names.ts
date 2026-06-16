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
