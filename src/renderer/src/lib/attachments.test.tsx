// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { selectImages, tooLargeMessage, useAttachments, MAX_IMAGE_BYTES } from './attachments'

function img(name: string, type = 'image/png', size?: number): File {
  const f = new File([new Uint8Array(8)], name, { type })
  if (size != null) Object.defineProperty(f, 'size', { value: size })
  return f
}
const txt = (name: string): File => new File(['hello'], name, { type: 'text/plain' })

describe('selectImages (#131)', () => {
  it('keeps only image/* files', () => {
    const r = selectImages([img('a.png'), txt('b.txt'), img('c.jpg', 'image/jpeg')])
    expect(r.ok.map((f) => f.name)).toEqual(['a.png', 'c.jpg'])
    expect(r.tooLarge).toEqual([])
  })

  it('splits images by the size limit', () => {
    const r = selectImages([img('small.png', 'image/png', 5), img('big.png', 'image/png', 50)], 10)
    expect(r.ok.map((f) => f.name)).toEqual(['small.png'])
    expect(r.tooLarge.map((f) => f.name)).toEqual(['big.png'])
  })

  it('treats the limit as inclusive (size == maxBytes is allowed)', () => {
    expect(selectImages([img('edge.png', 'image/png', 10)], 10).ok).toHaveLength(1)
  })

  it('handles null / empty input', () => {
    expect(selectImages(null)).toEqual({ ok: [], tooLarge: [] })
    expect(selectImages([])).toEqual({ ok: [], tooLarge: [] })
  })
})

describe('tooLargeMessage (#131)', () => {
  it('names the file and the limit in MB', () => {
    expect(tooLargeMessage(img('huge.png'), 20 * 1024 * 1024)).toBe(
      '“huge.png” is too large (max 20 MB).'
    )
  })

  it('falls back to "image" when the file has no name', () => {
    expect(tooLargeMessage(img(''), 20 * 1024 * 1024)).toContain('“image”')
  })
})

describe('useAttachments hook (#131)', () => {
  it('adds an image as a data-url attachment', async () => {
    const { result } = renderHook(() => useAttachments())
    await act(async () => {
      await result.current.addFiles([img('shot.png')])
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].name).toBe('shot.png')
    expect(result.current.items[0].dataUrl.startsWith('data:')).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('ignores non-image files', async () => {
    const { result } = renderHook(() => useAttachments())
    await act(async () => {
      await result.current.addFiles([txt('a.txt')])
    })
    expect(result.current.items).toHaveLength(0)
  })

  it('rejects an oversize image with an error and adds nothing', async () => {
    const { result } = renderHook(() => useAttachments())
    await act(async () => {
      await result.current.addFiles([img('big.png', 'image/png', MAX_IMAGE_BYTES + 1)])
    })
    expect(result.current.items).toHaveLength(0)
    expect(result.current.error).toMatch(/too large/)
  })

  it('remove() drops one and clear() empties + resets the error', async () => {
    const { result } = renderHook(() => useAttachments())
    await act(async () => {
      await result.current.addFiles([img('a.png'), img('b.png')])
    })
    expect(result.current.items).toHaveLength(2)

    const firstId = result.current.items[0].id
    act(() => result.current.remove(firstId))
    expect(result.current.items.map((i) => i.name)).toEqual(['b.png'])

    act(() => result.current.clear())
    expect(result.current.items).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })
})
