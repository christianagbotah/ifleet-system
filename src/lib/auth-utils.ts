import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const SALT_ROUNDS = 12

/**
 * Hash a plaintext password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * Compare a plaintext password against a bcrypt hash.
 * Returns true if the password matches.
 */
export async function comparePassword(
  plaintext: string,
  hashedPassword: string
): Promise<boolean> {
  if (!hashedPassword) return false
  return bcrypt.compare(plaintext, hashedPassword)
}

/**
 * Generate a cryptographically secure random hex token (32 bytes = 64 hex chars).
 */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Validate password strength.
 * - Minimum 8 characters
 */
export function validatePassword(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long'
  }
  if (password.length > 128) {
    return 'Password must be less than 128 characters'
  }
  return null
}
