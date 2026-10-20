import { db } from '@/lib/db'

export interface CompanyProfile {
  name: string
  email: string
  phone: string
  address: string
  city: string
  country: string
  website: string
  registrationNumber: string
}

function configured(value: string | undefined, fallback = ''): string {
  const trimmed = value?.trim()
  return trimmed || fallback
}

const LEGACY_COMPANY_PLACEHOLDERS = {
  companyName: 'iFleetPro Ltd.',
  companyEmail: 'info@fleetpro.com.gh',
  companyPhone: '+233 30 277 8899',
  companyAddress: '37 Ring Road Central',
  companyWebsite: 'www.fleetpro.com.gh',
} as const

type LegacyCompanyField = keyof typeof LEGACY_COMPANY_PLACEHOLDERS

/**
 * Build a field-level cleanup for the historical compiled tenant placeholders.
 * Customized values are never touched; a field is cleared only on an exact match.
 */
export function buildLegacyCompanyCleanup(
  settings: Partial<Record<LegacyCompanyField, string | null | undefined>>,
): Partial<Record<LegacyCompanyField, string>> {
  const updates: Partial<Record<LegacyCompanyField, string>> = {}
  for (const [field, legacyValue] of Object.entries(LEGACY_COMPANY_PLACEHOLDERS) as Array<
    [LegacyCompanyField, string]
  >) {
    if (settings[field] === legacyValue) updates[field] = ''
  }
  return updates
}

/**
 * Resolve tenant/company identity from runtime overrides and persisted settings.
 * Runtime values take precedence, allowing one build to serve different deployments.
 * Contact identity intentionally has no compiled tenant-specific fallback.
 */
export async function loadCompanyProfile(): Promise<CompanyProfile> {
  const settings = await db.systemSettings.findFirst({
    select: {
      companyName: true,
      companyEmail: true,
      companyPhone: true,
      companyAddress: true,
      companyCity: true,
      companyCountry: true,
      companyWebsite: true,
      registrationNumber: true,
    },
  })

  return {
    name: configured(process.env.COMPANY_NAME, settings?.companyName || ''),
    email: configured(process.env.COMPANY_EMAIL, settings?.companyEmail || ''),
    phone: configured(process.env.COMPANY_PHONE, settings?.companyPhone || ''),
    address: configured(process.env.COMPANY_ADDRESS, settings?.companyAddress || ''),
    city: configured(process.env.COMPANY_CITY, settings?.companyCity || ''),
    country: configured(process.env.COMPANY_COUNTRY, settings?.companyCountry || ''),
    website: configured(process.env.COMPANY_WEBSITE, settings?.companyWebsite || ''),
    registrationNumber: configured(
      process.env.COMPANY_REGISTRATION_NUMBER,
      settings?.registrationNumber || '',
    ),
  }
}

export function companyAddressLine(profile: CompanyProfile): string {
  return [profile.address, profile.city, profile.country].filter(Boolean).join(', ')
}

export function companyContactLine(profile: CompanyProfile): string {
  return [profile.phone, profile.email].filter(Boolean).join(' | ')
}
