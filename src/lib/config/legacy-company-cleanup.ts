export const LEGACY_COMPANY_PLACEHOLDERS = {
  companyName: 'iFleetPro Ltd.',
  companyEmail: 'info@fleetpro.com.gh',
  companyPhone: '+233 30 277 8899',
  companyAddress: '37 Ring Road Central',
  companyWebsite: 'www.fleetpro.com.gh',
} as const

export type LegacyCompanyField = keyof typeof LEGACY_COMPANY_PLACEHOLDERS

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
