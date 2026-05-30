// ════════════════════════════════════════════════════════════════════
// iFleet Pro — Centralized JWT Secret
// ════════════════════════════════════════════════════════════════════
//
// Single source of truth for JWT secret. NO hardcoded fallbacks.
// In development, generates a random secret. In production, throws
// if NEXTAUTH_SECRET is not set — preventing insecure deployments.
// ────────────────────────────────────────────────────────────────────

import { randomBytes } from 'crypto'

function getSecret(): string {
  const raw = process.env.NEXTAUTH_SECRET

  if (!raw) {
    if (process.env.NODE_ENV === 'development') {
      // Dev: auto-generate so local dev "just works"
      const devSecret = randomBytes(32).toString('hex')
      console.warn('[SECURITY] NEXTAUTH_SECRET not set. Using auto-generated dev secret (changes on each restart).')
      return devSecret
    }

    // Production: CRITICAL — refuse to start without a proper secret
    throw new Error(
      '[CRITICAL] NEXTAUTH_SECRET environment variable is not set! ' +
      'This is required in production. Generate one with: openssl rand -hex 32'
    )
  }

  return raw
}

// Resolve once at module load time
export const JWT_SECRET = getSecret()

/**
 * Returns the secret encoded as Uint8Array for `jose` library usage.
 * Used in Edge Runtime contexts (proxy.ts, SSE stream).
 */
export function getJwtSecretKey(): Uint8Array {
  return new TextEncoder().encode(JWT_SECRET)
}
