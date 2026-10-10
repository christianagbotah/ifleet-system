import { SignJWT, jwtVerify } from 'jose'

import { getJwtSecretKey } from '@/lib/jwt-secret'

const PORTAL_ISSUER = 'ifleetpro'
const PORTAL_AUDIENCE = 'ifleetpro-client-portal'
const PORTAL_PURPOSE = 'client_portal'
const SECONDS_PER_DAY = 24 * 60 * 60

export interface PortalShareClaims {
  clientId: string
  issuedBy: string
  purpose: 'client_portal'
  expiresAt: Date
}

export interface CreatePortalShareTokenInput {
  clientId: string
  issuedBy: string
  ttlDays?: number
  secret?: Uint8Array
  now?: Date
}

export interface VerifyPortalShareTokenOptions {
  secret?: Uint8Array
  now?: Date
}

export function validatePortalShareTtlDays(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 1 && value <= 30
}

export async function createPortalShareToken(input: CreatePortalShareTokenInput): Promise<{
  token: string
  expiresAt: Date
}> {
  const ttlDays = input.ttlDays ?? 7
  if (!validatePortalShareTtlDays(ttlDays)) throw new Error('portal_share_ttl_invalid')
  if (!input.clientId) throw new Error('portal_share_client_invalid')
  if (!input.issuedBy) throw new Error('portal_share_issuer_invalid')

  const now = input.now ?? new Date()
  const issuedAtSeconds = Math.floor(now.getTime() / 1000)
  const expiresAtSeconds = issuedAtSeconds + ttlDays * SECONDS_PER_DAY
  const secret = input.secret ?? getJwtSecretKey()

  const token = await new SignJWT({
    clientId: input.clientId,
    issuedBy: input.issuedBy,
    purpose: PORTAL_PURPOSE,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(PORTAL_ISSUER)
    .setAudience(PORTAL_AUDIENCE)
    .setSubject(input.clientId)
    .setIssuedAt(issuedAtSeconds)
    .setExpirationTime(expiresAtSeconds)
    .sign(secret)

  return {
    token,
    expiresAt: new Date(expiresAtSeconds * 1000),
  }
}

export async function verifyPortalShareToken(
  token: string,
  options: VerifyPortalShareTokenOptions = {},
): Promise<PortalShareClaims> {
  if (!token) throw new Error('portal_share_token_missing')

  const { payload } = await jwtVerify(token, options.secret ?? getJwtSecretKey(), {
    issuer: PORTAL_ISSUER,
    audience: PORTAL_AUDIENCE,
    currentDate: options.now,
  })

  if (payload.purpose !== PORTAL_PURPOSE) throw new Error('portal_share_token_purpose_invalid')
  if (typeof payload.clientId !== 'string' || payload.clientId.length === 0) {
    throw new Error('portal_share_token_client_invalid')
  }
  if (payload.sub !== payload.clientId) throw new Error('portal_share_token_subject_invalid')
  if (typeof payload.issuedBy !== 'string' || payload.issuedBy.length === 0) {
    throw new Error('portal_share_token_issuer_invalid')
  }
  if (typeof payload.exp !== 'number') throw new Error('portal_share_token_expiry_invalid')

  return {
    clientId: payload.clientId,
    issuedBy: payload.issuedBy,
    purpose: PORTAL_PURPOSE,
    expiresAt: new Date(payload.exp * 1000),
  }
}

export function readPortalTokenHeader(headers: Headers): string | null {
  const token = headers.get('x-portal-token')?.trim()
  return token || null
}
