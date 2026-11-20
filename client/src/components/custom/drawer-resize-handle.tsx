"use client"

import { useRef, useEffect } from "react"
import { GripVertical } from "lucide-react"

export type ResizeSource = "pointer" | "keyboard"

export function DrawerResizeHandle({
  onResize,
  width,
  minWidth,
  maxWidth,
}: {
  onResize: (newWidth: number, source: ResizeSource) => void
  width: number
  minWidth: number
  maxWidth: number
}) {
  const handleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const container = handleRef.current?.parentElement
      if (!container) return

      const startWidth = container.offsetWidth
      const prevSelect = document.body.style.userSelect
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth - delta))
        onResize(newWidth, "pointer")
      }

      const handlePointerUp = () => {
        document.removeEventListener('pointermove', handlePointerMove)
        document.removeEventListener('pointerup', handlePointerUp)
        document.body.style.userSelect = prevSelect
        document.body.style.cursor = ''
        try {
          handleRef.current?.releasePointerCapture?.(e.pointerId)
        } catch {
          // ignore
        }
      }

      try {
        handleRef.current?.setPointerCapture?.(e.pointerId)
      } catch {
        // ignore if not supported
      }

      document.addEventListener('pointermove', handlePointerMove)
      document.addEventListener('pointerup', handlePointerUp)
    }

    const handle = handleRef.current
    if (handle) {
      handle.addEventListener('pointerdown', handlePointerDown)
    }

    return () => {
      if (handle) {
        handle.removeEventListener('pointerdown', handlePointerDown)
      }
    }
  }, [onResize, minWidth, maxWidth])

  useEffect(() => {
    const el = handleRef.current
    if (!el) return
    const onKeyDown = (ev: KeyboardEvent) => {
      if (!(ev.key === 'ArrowLeft' || ev.key === 'ArrowRight' || ev.key === 'Home' || ev.key === 'End')) return
      ev.preventDefault()
      const currContainer = el.parentElement
      if (!currContainer) return
      const curr = currContainer.offsetWidth
      if (ev.key === 'ArrowLeft') onResize(Math.max(minWidth, curr - 16), "keyboard")
      if (ev.key === 'ArrowRight') onResize(Math.min(maxWidth, curr + 16), "keyboard")
      if (ev.key === 'Home') onResize(minWidth, "keyboard")
      if (ev.key === 'End') onResize(maxWidth, "keyboard")
    }
    el.addEventListener('keydown', onKeyDown)
    return () => el.removeEventListener('keydown', onKeyDown)
  }, [onResize, minWidth, maxWidth])

  return (
    <div
      ref={handleRef}
      className="group absolute bottom-0 left-0 top-0 z-40 -ml-1 w-3 cursor-col-resize touch-none bg-transparent transition-colors hover:w-4 hover:bg-neutral-200/35"
      style={{ touchAction: 'none' }}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize drawer"
      aria-valuenow={width}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      tabIndex={0}
    >
      <div className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-90 group-focus-visible:opacity-90">
        <GripVertical className="h-3.5 w-3.5 text-neutral-400/90" />
      </div>
    </div>
  )
}
