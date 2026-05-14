/**
 * Security Utility Functions for ${APP_NAME}
 *
 * Provides input sanitization, JWT validation helpers, bot detection,
 * secure token generation, and sensitive-data masking for logs.
 *
 * @module security
 */

import { APP_NAME } from '@/lib/constants'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

// ── Input sanitization ─────────────────────────────────────────────────────

/**
 * Sanitize a user-input string to mitigate XSS and injection attacks.
 *
 * - Strips HTML tags
 * - Normalises whitespace (collapses runs of spaces/tabs/newlines into a single space)
 * - Trims leading/trailing whitespace
 * - Encodes `<`, `>`, `&`, `"`, `'` to their HTML-entity equivalents
 *
 * @param input - Raw user input
 * @returns Sanitized string safe for rendering and storage
 *
 * @example
 * ```ts
 * sanitizeInput('  <script>alert("xss")</script>  Hello   World  ')
 * // → '&lt;script&gt;alert("xss")&lt;/script&gt; Hello World'
 * ```
 */
export function sanitizeInput(input: string): string {
  // Step 1: Strip HTML tags
  const noTags = input.replace(/<[^>]*>/g, '')

  // Step 2: Normalise whitespace
  const normalised = noTags.replace(/\s+/g, ' ').trim()

  // Step 3: Encode dangerous characters
  return normalised
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// ── JWT format validation ──────────────────────────────────────────────────

/**
 * Validate that a string looks like a well-formed JWT (header.payload.signature).
 *
 * This does **not** verify the signature or expiry — it only checks the format
 * so you can fail-fast before passing the token to `jwt.verify()`.
 *
 * @param token - The token string to validate
 * @returns `true` if the token has the expected three Base64url segments
 *
 * @example
 * ```ts
 * isValidJwtFormat('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123') // true
 * isValidJwtFormat('not-a-jwt') // false
 * ```
 */
export function isValidJwtFormat(token: string): boolean {
  // JWT must have exactly two dots separating three Base64url segments
  const parts = token.split('.')
  if (parts.length !== 3) return false

  const base64urlRegex = /^[A-Za-z0-9_-]+$/
  return parts.every((part) => part.length > 0 && base64urlRegex.test(part))
}

// ── Bot / suspicious request detection ─────────────────────────────────────

/** Patterns commonly found in known bot user-agents */
const BOT_PATTERNS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /scraper/i,
  /curl/i,
  /wget/i,
  /python-requests/i,
  /httpclient/i,
  /java\/\d/i,
  /php/i,
  /masscan/i,
  /nmap/i,
  /nikto/i,
]

/**
 * Perform a basic check to determine whether a request appears suspicious
 * (e.g. from a bot or scanning tool).
 *
 * Heuristics:
 * - Missing or empty `User-Agent` header
 * - User-Agent matches known bot patterns
 * - Missing `Accept` header (most real browsers send one)
 *
 * **Note**: This is a lightweight heuristic — not a bulletproof bot detector.
 * Use it to flag requests for additional scrutiny, not as the sole gate.
 *
 * @param request - The incoming Next.js request
 * @returns `true` if the request looks suspicious
 */
export function isSuspiciousRequest(request: NextRequest): boolean {
  const userAgent = request.headers.get('user-agent')

  // Most real browsers always send a User-Agent
  if (!userAgent || userAgent.trim() === '') {
    return true
  }

  // Check against known bot patterns
  for (const pattern of BOT_PATTERNS) {
    if (pattern.test(userAgent)) {
      return true
    }
  }

  // Real browsers typically include an Accept header
  const accept = request.headers.get('accept')
  if (!accept || accept.trim() === '') {
    return true
  }

  return false
}

// ── Secure random token generation ─────────────────────────────────────────

/**
 * Generate a cryptographically secure random token.
 *
 * Uses `crypto.randomBytes` to produce a hex-encoded string of the
 * requested length (in bytes; the resulting string will be twice as many
 * hex characters).
 *
 * @param byteLength - Number of random bytes (default 32 → 64 hex chars)
 * @returns Hex-encoded random string
 *
 * @example
 * ```ts
 * generateSecureToken()       // e.g. 'a3f1b9c4…'  (64 chars)
 * generateSecureToken(16)     // e.g. '7d2e9a…'    (32 chars)
 * ```
 */
export function generateSecureToken(byteLength: number = 32): string {
  return crypto.randomBytes(byteLength).toString('hex')
}

// ── Sensitive data masking ─────────────────────────────────────────────────

/**
 * Mask sensitive data so only the last `visibleChars` characters are visible.
 * Useful for logging phone numbers, emails, tokens, etc.
 *
 * @param data          - The sensitive string to mask
 * @param visibleChars  - Number of characters to leave visible at the end (default 4)
 * @returns Masked string with leading characters replaced by `*`
 *
 * @example
 * ```ts
 * maskSensitiveData('0241234567')          // '****4567'
 * maskSensitiveData('0241234567', 3)       // '*******567'
 * maskSensitiveData('ab')                  // '**'
 * ```
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (!data) return data
  if (data.length <= visibleChars) {
    return '*'.repeat(data.length)
  }
  const maskedLength = data.length - visibleChars
  return '*'.repeat(maskedLength) + data.slice(maskedLength)
}
