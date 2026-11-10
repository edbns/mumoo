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
 * Drag-and-drop and the file dialog for one file (from the 21st.dev "File Dropzone", reduced to what a single song needs).
 * A file that is not allowed is reported in `errors` and never reaches `onSelect`.
 */
export function useFileUpload({ accept, onSelect }: { accept: string; onSelect: (file: File) => void }) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [errors, setErrors] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const take = useCallback((file: File | undefined) => {
    if (!file) return
    if (!matchesAccept(file, accept)) { setErrors(['This file type is not supported.']); return }
    setErrors([])
    onSelect(file)
  }, [accept, onSelect])

  return {
    errors,
    isDragging,
    openFileDialog: () => inputRef.current?.click(),
    getInputProps: () => ({
      ref: inputRef,
      type: 'file' as const,
      id: `${id}-file-input`,
      accept,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        take(event.target.files?.[0])
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
      take(event.dataTransfer.files[0])
    },
  }
}
