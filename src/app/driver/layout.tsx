import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'FleetPro Driver Portal',
  description: 'Driver portal for FleetPro fleet management',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function DriverPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  )
}
