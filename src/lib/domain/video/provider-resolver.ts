import type { TelematicsProviderAdapter } from '@/lib/domain/telematics/provider'

import { GenericHttpVideoProvider } from './providers/generic-http-video'

export function resolveVideoProvider(providerId: string): TelematicsProviderAdapter | null {
  if (providerId === 'generic-http') return new GenericHttpVideoProvider()
  return null
}
