import type { Metadata } from 'next'

import { PublicClientPortal } from '@/components/portal/PublicClientPortal'

export const metadata: Metadata = {
  title: 'Secure Client Portal | iFleetPro',
  description: 'Secure shipment tracking and account portal for iFleetPro customers.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function PortalPage() {
  return <PublicClientPortal />
}
