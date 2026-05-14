'use client'

import { useCallback, useRef } from 'react'

/**
 * Hook to play a subtle notification sound.
 * Respects user preference stored in localStorage.
 * Auto-plays on first call after user interaction (browser policy).
 */
export function useNotificationSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const play = useCallback(() => {
    // Check user preference
    if (typeof window === 'undefined') return
    const soundEnabled = localStorage.getItem('fleetpro-notification-sound')
    if (soundEnabled === 'false') return

    try {
      // Create audio element if not cached
      if (!audioRef.current) {
        audioRef.current = new Audio('/sounds/notification.wav')
        audioRef.current.volume = 0.3
      }

      // Reset to beginning if already playing
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {
        // Autoplay blocked — ignore silently
      })
    } catch {
      // Audio not supported
    }
  }, [])

  const toggleSound = useCallback(() => {
    if (typeof window === 'undefined') return
    const current = localStorage.getItem('fleetpro-notification-sound')
    const newValue = current === 'false' ? 'true' : 'false'
    localStorage.setItem('fleetpro-notification-sound', newValue)
    return newValue === 'true'
  }, [])

  const isSoundEnabled = useCallback(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('fleetpro-notification-sound') !== 'false'
  }, [])

  return { play, toggleSound, isSoundEnabled }
}
