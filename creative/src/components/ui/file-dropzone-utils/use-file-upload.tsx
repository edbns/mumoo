import { useCallback, useId, useRef, useState } from 'react'

/** Whether a file is allowed by an `accept` list the way a file input reads it: by type (`audio/*`, `audio/mpeg`) or by extension (`.mp3`). */
function matchesAccept(file: File, accept: string) {
  const name = file.name.toLowerCase()
  return accept.split(',').map((item) => item.trim().toLowerCase()).some((item) => {
    if (item.startsWith('.')) return name.endsWith(item)
    if (item.endsWith('/*')) return file.type.startsWith(item.slice(0, -1))
    return file.type === item
  })
}

/**
 * Drag-and-drop and the file dialog for one file (from the 21st.dev "File Dropzone", reduced to what a single song needs), or with
 * `onSelectMany` for several at once. A file that is not allowed is reported in `errors` and never reaches `onSelect` / `onSelectMany`.
 */
export function useFileUpload({ accept, onSelect, onSelectMany }: { accept: string; onSelect?: (file: File) => void; onSelectMany?: (files: File[]) => void }) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [errors, setErrors] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const take = useCallback((list: FileList | null) => {
    const files = [...(list ?? [])].slice(0, onSelectMany ? undefined : 1)
    if (!files.length) return
    const allowed = files.filter((file) => matchesAccept(file, accept))
    setErrors(allowed.length < files.length ? [files.length > 1 ? 'Some of these files are not supported.' : 'This file type is not supported.'] : [])
    if (!allowed.length) return
    if (onSelectMany) onSelectMany(allowed)
    else onSelect?.(allowed[0])
  }, [accept, onSelect, onSelectMany])

  return {
    errors,
    isDragging,
    openFileDialog: () => inputRef.current?.click(),
    getInputProps: () => ({
      ref: inputRef,
      type: 'file' as const,
      id: `${id}-file-input`,
      accept,
      multiple: Boolean(onSelectMany),
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        take(event.target.files)
        event.target.value = ''
      },
    }),
    handleDragEnter: (event: React.DragEvent) => {
      event.preventDefault()
      dragDepth.current++
      if (event.dataTransfer.items.length > 0) setIsDragging(true)
    },
    handleDragLeave: (event: React.DragEvent) => {
      event.preventDefault()
      if (--dragDepth.current === 0) setIsDragging(false)
    },
    handleDragOver: (event: React.DragEvent) => event.preventDefault(),
    handleDrop: (event: React.DragEvent) => {
      event.preventDefault()
      dragDepth.current = 0
      setIsDragging(false)
      take(event.dataTransfer.files)
    },
  }
}
