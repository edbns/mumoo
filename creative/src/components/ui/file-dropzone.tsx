'use client'

import { AlertCircleIcon, UploadIcon, XIcon, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFileUpload } from '@/components/ui/file-dropzone-utils/use-file-upload'

/** The "File Dropzone" from 21st.dev, for one file: drop it or pick it, and a chosen file (when the page keeps one) shows in the same place. */
export function FileDropzone({ accept, icon: Icon, title, hint, buttonLabel, inputLabel, removeLabel, fileName, onSelect, onRemove }: {
  accept: string
  icon: LucideIcon
  title: string
  /** What may be dropped, in words. */
  hint: string
  buttonLabel: string
  inputLabel: string
  /** The file that is chosen right now, if the page keeps one; then `removeLabel` and `onRemove` let it be taken away. */
  fileName?: string
  removeLabel?: string
  onSelect: (file: File) => void
  onRemove?: () => void
}) {
  const { errors, isDragging, openFileDialog, getInputProps, handleDragEnter, handleDragLeave, handleDragOver, handleDrop } =
    useFileUpload({ accept, onSelect })

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <div
          className={cn(
            'has-[input:focus-visible]:ring-ring/60 relative flex min-h-52 flex-col items-center justify-center overflow-hidden rounded-xl bg-muted p-4 transition-colors has-[input:focus-visible]:ring-2',
            isDragging && 'bg-secondary',
          )}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input {...getInputProps()} aria-label={inputLabel} className="sr-only" />
          <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-3 text-center">
            <div aria-hidden="true" className="mb-2 flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary">
              <Icon className={cn('size-4', fileName ? 'text-primary' : 'opacity-60')} />
            </div>
            {fileName ? (
              <p className="max-w-full truncate text-sm font-medium">{fileName}</p>
            ) : (
              <>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-muted-foreground text-xs">{hint}</p>
                <Button className="mt-4" onClick={openFileDialog} variant="secondary">
                  <UploadIcon aria-hidden="true" className="-ms-1 size-4 opacity-60" />
                  {buttonLabel}
                </Button>
              </>
            )}
          </div>
        </div>
        {fileName && onRemove && (
          <button
            aria-label={removeLabel}
            className="absolute top-3 right-3 flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/60 p-0 text-white outline-ring transition-colors hover:bg-black/80 focus-visible:outline-2"
            onClick={onRemove}
            type="button"
          >
            <XIcon aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
      {errors.length > 0 && (
        <div className="text-destructive flex items-center gap-1 text-xs" role="alert">
          <AlertCircleIcon className="size-3 shrink-0" />
          <span>{errors[0]}</span>
        </div>
      )}
    </div>
  )
}
