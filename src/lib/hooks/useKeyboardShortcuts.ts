'use client'

import React from 'react'

export interface KeyboardShortcutHandlers {
  onNewTrip?: () => void
  onNewTruck?: () => void
  onNewDriver?: () => void
  onRecordExpense?: () => void
  onToggleCommandPalette?: () => void
  onGoHome?: () => void
}

function isInputElement(target: EventTarget | null): boolean {
  if (!target) return false
  const el = target as HTMLElement
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  )
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcutHandlers) {
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey

      // Cmd/Ctrl + K → Toggle command palette (works even in inputs)
      if (mod && e.key === 'k') {
        e.preventDefault()
        shortcuts.onToggleCommandPalette?.()
        return
      }

      // Don't fire other shortcuts when user is typing in an input
      if (isInputElement(e.target)) return

      // Cmd/Ctrl + N → New trip
      if (mod && e.key === 'n') {
        e.preventDefault()
        shortcuts.onNewTrip?.()
        return
      }

      // Cmd/Ctrl + T → New truck
      if (mod && e.key === 't') {
        e.preventDefault()
        shortcuts.onNewTruck?.()
        return
      }

      // Cmd/Ctrl + D → New driver
      if (mod && e.key === 'd') {
        e.preventDefault()
        shortcuts.onNewDriver?.()
        return
      }

      // Cmd/Ctrl + E → Record expense
      if (mod && e.key === 'e') {
        e.preventDefault()
        shortcuts.onRecordExpense?.()
        return
      }

      // Cmd/Ctrl + H → Go home
      if (mod && e.key === 'h') {
        e.preventDefault()
        shortcuts.onGoHome?.()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])
}
