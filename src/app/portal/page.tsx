import type { Metadata } from 'next'

import { PublicClientPortal } from '@/components/portal/PublicClientPortal'

export const metadata: Metadata = {
  title: 'Secure Client Portal | Fleetivo',
  description: 'Secure shipment tracking and account portal for Fleetivo customers.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function PortalPage() {
  return <PublicClientPortal />
}
