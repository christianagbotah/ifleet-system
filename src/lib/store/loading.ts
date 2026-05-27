import { create } from 'zustand'

interface LoadingState {
  /** Number of active mutating requests (POST, PUT, PATCH, DELETE) */
  pendingCount: number
  /** Human-readable message shown in the overlay (optional) */
  message: string | null
  /** Internal timer ref — not stored in zustand, but we track show state */
  /** Whether the overlay is actually visible (respects the debounce delay) */
  isVisible: boolean

  /** Called when a mutating request starts */
  startLoading: (message?: string) => void
  /** Called when a mutating request completes */
  stopLoading: () => void
  /** Force-set visibility (for explicit use outside apiFetch) */
  setVisible: (visible: boolean) => void
}

// We keep a separate module-level timer so it persists across store updates
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 400 // Only show overlay after 400ms of loading

export const useLoadingStore = create<LoadingState>()((set, get) => ({
  pendingCount: 0,
  message: null,
  isVisible: false,

  startLoading: (message?: string) => {
    const newCount = get().pendingCount + 1
    set({
      pendingCount: newCount,
      message: message || get().message || 'Processing...',
    })

    // Show overlay after debounce — avoids flicker for fast requests
    if (!get().isVisible && !debounceTimer) {
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        // Only show if still loading
        if (get().pendingCount > 0) {
          set({ isVisible: true })
        }
      }, DEBOUNCE_MS)
    }
  },

  stopLoading: () => {
    const newCount = Math.max(0, get().pendingCount - 1)
    set({ pendingCount: newCount })

    if (newCount === 0) {
      // Clear debounce timer if still pending
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      set({ isVisible: false, message: null })
    }
  },

  setVisible: (visible: boolean) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    set({ isVisible: visible })
  },
}))
