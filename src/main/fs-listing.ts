import { dirname, join } from 'node:path'
import type { FsEntry, FsListing } from '../shared/types'

/** The slice of a `fs.Dirent` the listing needs — so the builder is fs-free. */
export interface RawDirent {
  name: string
  isDirectory(): boolean
  isSymbolicLink(): boolean
}

/**
 * Build a directory listing for the in-app file picker from a raw `readdir`
 * result. Pure (path math only; the fs reads + symlink `stat` are injected), so
 * the picker's filtering/sorting is unit-testable without touching the disk.
 *
 * - Hides dotfiles by default.
 * - Resolves a symlink's *target* type via `resolveIsDir` so a link to a folder
 *   sorts and navigates like a folder.
 * - Sorts directories first, then alphabetically (locale-aware).
 * - `parent` is null at the filesystem root (where `dirname(abs) === abs`).
 */
export function buildFsListing(
  abs: string,
  dirents: RawDirent[],
  resolveIsDir: (fullPath: string) => boolean
): FsListing {
  const entries: FsEntry[] = dirents
    .filter((d) => !d.name.startsWith('.'))
    .map((d) => {
      const full = join(abs, d.name)
      const isSymlink = d.isSymbolicLink()
      const isDir = isSymlink ? resolveIsDir(full) : d.isDirectory()
      return { name: d.name, path: full, isDir, isSymlink }
    })
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
  const parent = dirname(abs)
  return { path: abs, parent: parent === abs ? null : parent, entries }
}
