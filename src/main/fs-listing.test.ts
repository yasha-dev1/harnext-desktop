import { describe, it, expect, vi } from 'vitest'
import { join } from 'node:path'
import { buildFsListing, type RawDirent } from './fs-listing'

const dirent = (name: string, kind: 'dir' | 'file' | 'link'): RawDirent => ({
  name,
  isDirectory: () => kind === 'dir',
  isSymbolicLink: () => kind === 'link'
})

// statSync stand-in: only consulted for symlinks. Treat a link as pointing at a
// directory when its name contains "docs".
const resolveIsDir = (full: string): boolean => full.includes('docs')

describe('buildFsListing', () => {
  it('hides dotfiles', () => {
    const r = buildFsListing(
      '/home/me',
      [dirent('.git', 'dir'), dirent('src', 'dir')],
      resolveIsDir
    )
    expect(r.entries.map((e) => e.name)).toEqual(['src'])
  })

  it('maps each entry with its full path and flags', () => {
    const r = buildFsListing('/home/me', [dirent('notes.txt', 'file')], resolveIsDir)
    expect(r.entries[0]).toEqual({
      name: 'notes.txt',
      // buildFsListing joins with the platform separator (backslash on Windows),
      // so derive the expected path the same way to stay cross-platform.
      path: join('/home/me', 'notes.txt'),
      isDir: false,
      isSymlink: false
    })
  })

  it('resolves a symlink to its target type (link → folder sorts as a folder)', () => {
    const r = buildFsListing(
      '/home/me',
      [dirent('ld-docs', 'link'), dirent('ld-file', 'link')],
      resolveIsDir
    )
    const docs = r.entries.find((e) => e.name === 'ld-docs')!
    const file = r.entries.find((e) => e.name === 'ld-file')!
    expect(docs).toMatchObject({ isSymlink: true, isDir: true })
    expect(file).toMatchObject({ isSymlink: true, isDir: false })
  })

  it('does not stat non-symlinks (uses the dirent type directly)', () => {
    const spy = vi.fn(() => true)
    buildFsListing('/x', [dirent('plain', 'dir')], spy)
    expect(spy).not.toHaveBeenCalled()
  })

  it('sorts directories first, then alphabetically (locale-aware)', () => {
    const r = buildFsListing(
      '/p',
      [
        dirent('zeta.txt', 'file'),
        dirent('Alpha', 'dir'),
        dirent('apple.txt', 'file'),
        dirent('beta', 'dir')
      ],
      resolveIsDir
    )
    expect(r.entries.map((e) => e.name)).toEqual(['Alpha', 'beta', 'apple.txt', 'zeta.txt'])
  })

  it('reports the parent directory', () => {
    expect(buildFsListing('/home/me/proj', [], resolveIsDir).parent).toBe('/home/me')
  })

  it('reports a null parent at the filesystem root', () => {
    expect(buildFsListing('/', [], resolveIsDir).parent).toBeNull()
  })
})
