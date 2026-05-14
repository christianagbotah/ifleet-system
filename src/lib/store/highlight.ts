import { create } from 'zustand'

/**
 * Global highlight store for entity-aware navigation.
 *
 * When a user clicks "View in [Page]" from ActivityFeed (or any other source),
 * the target entityId and entityType are stored here. The destination view
 * reads and clears the highlight on mount, then scrolls to and visually
 * highlights the matching row.
 */

interface HighlightState {
  entityId: string | null
  entityType: string | null
  /** Set a new highlight (e.g. before navigating to a list page) */
  setHighlight: (entityId: string, entityType: string) => void
  /** Consume the current highlight — returns it and clears the store */
  consumeHighlight: (expectedType?: string) => { entityId: string; entityType: string } | null
  /** Clear highlight without consuming */
  clearHighlight: () => void
}

export const useHighlightStore = create<HighlightState>((set, get) => ({
  entityId: null,
  entityType: null,

  setHighlight: (entityId, entityType) => {
    set({ entityId, entityType })
  },

  consumeHighlight: (expectedType) => {
    const { entityId, entityType } = get()
    if (!entityId || !entityType) return null
    if (expectedType && entityType !== expectedType) return null
    // Clear immediately after consuming
    set({ entityId: null, entityType: null })
    return { entityId, entityType }
  },

  clearHighlight: () => {
    set({ entityId: null, entityType: null })
  },
}))
