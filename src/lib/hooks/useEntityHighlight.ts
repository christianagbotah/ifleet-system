'use client'

import * as React from 'react'
import { useEffect, useRef, useCallback, useState } from 'react'
import { useHighlightStore } from '@/lib/store/highlight'

/**
 * Hook for list views to handle entity highlighting from navigation.
 *
 * Usage:
 * ```tsx
 * function MyView() {
 *   const { highlightEntityId, highlightClassName, scrollIntoView } = useEntityHighlight('truck')
 *   const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})
 *
 *   // Scroll to highlighted row after data loads
 *   useEffect(() => {
 *     if (highlightEntityId && rowRefs.current[highlightEntityId]) {
 *       scrollIntoView(rowRefs.current[highlightEntityId])
 *     }
 *   }, [highlightEntityId, items, scrollIntoView])
 *
 *   return items.map((truck) => (
 *     <TableRow
 *       key={truck.id}
 *       ref={(el) => { rowRefs.current[truck.id] = el }}
 *       className={truck.id === highlightEntityId ? highlightClassName : ''}
 *     />
 *   ))
 * }
 * ```
 */

interface UseEntityHighlightReturn {
  /** The entity ID to highlight, or null if no highlight is pending */
  highlightEntityId: string | null
  /** CSS class to apply to the highlighted row (empty string if no highlight) */
  highlightClassName: string
  /** Call this with a ref to the highlighted row to auto-scroll it into view */
  scrollIntoView: (el: HTMLElement | null) => void
  /** Manually clear the highlight */
  clearHighlight: () => void
}

export function useEntityHighlight(entityType: string): UseEntityHighlightReturn {
  const consumeHighlight = useHighlightStore((s) => s.consumeHighlight)
  const [highlightEntityId, setHighlightEntityId] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasConsumed = useRef(false)

  // Synchronize with external zustand store on mount.
  // This is a valid external-store sync pattern — we read from zustand
  // (an external state manager) and mirror the value into local state
  // so the component can hold the highlight for a timed duration even
  // after the store is cleared.
  useEffect(() => {
    if (hasConsumed.current) return
    hasConsumed.current = true

    const highlight = consumeHighlight(entityType)
    if (highlight) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external store sync
      setHighlightEntityId(highlight.entityId)
      // Auto-clear highlight after 5 seconds (async callback, not sync)
      timerRef.current = setTimeout(() => {
        setHighlightEntityId(null)
      }, 5000)
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [entityType, consumeHighlight])

  const scrollIntoView = useCallback((el: HTMLElement | null) => {
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }
  }, [])

  const clearHighlight = useCallback(() => {
    setHighlightEntityId(null)
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return {
    highlightEntityId,
    highlightClassName: highlightEntityId ? 'entity-highlight-row' : '',
    scrollIntoView,
    clearHighlight,
  }
}
