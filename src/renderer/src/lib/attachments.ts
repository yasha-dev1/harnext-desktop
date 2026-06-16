import { useCallback, useState } from 'react'

// Matches @harnext/core's MAX_IMAGE_BYTES; the SDK re-validates on send.
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

export interface Attachment {
  id: string
  name: string
  bytes: number
  dataUrl: string
}

let counter = 0
const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('read failed'))
    r.readAsDataURL(file)
  })

/**
 * Partition incoming files for attachment (#131): keep only images, and split
 * them by the size limit. Pure + exported so the filtering/limit rules are
 * unit-testable without a DOM or FileReader. `tooLarge[0]` is what the hook
 * surfaces as the size error.
 */
export function selectImages(
  files: FileList | File[] | null | undefined,
  maxBytes: number = MAX_IMAGE_BYTES
): { ok: File[]; tooLarge: File[] } {
  const imgs = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))
  return {
    ok: imgs.filter((f) => f.size <= maxBytes),
    tooLarge: imgs.filter((f) => f.size > maxBytes)
  }
}

/** The user-facing "too large" message for an over-limit image (#131). */
export function tooLargeMessage(file: File, maxBytes: number = MAX_IMAGE_BYTES): string {
  return `“${file.name || 'image'}” is too large (max ${maxBytes / 1024 / 1024} MB).`
}

export interface UseAttachments {
  items: Attachment[]
  error: string | null
  addFiles: (files: FileList | File[] | null | undefined) => Promise<void>
  onPaste: (e: React.ClipboardEvent) => void
  onDrop: (e: React.DragEvent) => void
  remove: (id: string) => void
  clear: () => void
}

/** Clipboard-paste / drag-drop / file-pick image attachments as data URLs. */
export function useAttachments(): UseAttachments {
  const [items, setItems] = useState<Attachment[]>([])
  const [error, setError] = useState<string | null>(null)

  const addFiles = useCallback(async (files: FileList | File[] | null | undefined) => {
    const { ok, tooLarge } = selectImages(files)
    if (ok.length === 0 && tooLarge.length === 0) return
    setError(tooLarge.length ? tooLargeMessage(tooLarge[0]) : null)
    for (const f of ok) {
      try {
        const dataUrl = await fileToDataUrl(f)
        setItems((prev) => [
          ...prev,
          { id: `a${++counter}`, name: f.name || 'image', bytes: f.size, dataUrl }
        ])
      } catch {
        setError('Could not read an image.')
      }
    }
  }, [])

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter((f): f is File => !!f)
      if (files.length) {
        e.preventDefault()
        void addFiles(files)
      }
    },
    [addFiles]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const files = e.dataTransfer?.files
      if (files && Array.from(files).some((f) => f.type.startsWith('image/'))) {
        e.preventDefault()
        void addFiles(files)
      }
    },
    [addFiles]
  )

  const remove = useCallback((id: string) => setItems((p) => p.filter((a) => a.id !== id)), [])
  const clear = useCallback(() => {
    setItems([])
    setError(null)
  }, [])

  return { items, error, addFiles, onPaste, onDrop, remove, clear }
}
