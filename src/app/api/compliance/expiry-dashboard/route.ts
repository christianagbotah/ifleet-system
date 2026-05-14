import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'

// ============ Types ============

type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'valid'

interface ExpiryItem {
  type: string
  id: string
  entityId: string
  name: string
  description: string
  expiryDate: string
  daysRemaining: number
  status: ExpiryStatus
  entityLabel: string
  actionUrl: string
}

interface CategorySummary {
  total: number
  expired: number
  critical: number
  warning: number
  valid: number
  items: ExpiryItem[]
}

// ============ Helpers ============

function calculateExpiryStatus(expiryDate: Date): ExpiryStatus {
  const now = new Date()
  const diffMs = expiryDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 'expired'
  if (diffDays <= 7) return 'critical'
  if (diffDays <= 30) return 'warning'
  return 'valid'
}

function calculateDaysRemaining(expiryDate: Date): number {
  const now = new Date()
  const diffMs = expiryDate.getTime() - now.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

function summarizeCategory(items: ExpiryItem[]): CategorySummary {
  return {
    total: items.length,
    expired: items.filter(i => i.status === 'expired').length,
    critical: items.filter(i => i.status === 'critical').length,
    warning: items.filter(i => i.status === 'warning').length,
    valid: items.filter(i => i.status === 'valid').length,
    items,
  }
}

function filterByDaysAhead(items: ExpiryItem[], daysAhead: number): ExpiryItem[] {
  // Show items expiring within daysAhead days from now, plus all already-expired items
  return items.filter(item => item.daysRemaining <= daysAhead)
}

// ============ Route Handler ============

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const daysAhead = parseInt(searchParams.get('daysAhead') || '90', 10)

  try {
    const now = new Date()
    const cutoffDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

    // ─── 1. Insurance Policies ───
    const insurances = await db.insurance.findMany({
      where: {
        status: 'active',
      },
      select: {
        id: true,
        truckId: true,
        provider: true,
        policyNumber: true,
        type: true,
        endDate: true,
        truck: {
          select: { plateNumber: true },
        },
      },
    })

    const insuranceItems: ExpiryItem[] = insurances.map(ins => {
      const status = calculateExpiryStatus(ins.endDate)
      return {
        type: 'insurance',
        id: ins.id,
        entityId: ins.truckId,
        name: ins.truck.plateNumber,
        description: `${ins.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} — ${ins.provider}`,
        expiryDate: ins.endDate.toISOString(),
        daysRemaining: calculateDaysRemaining(ins.endDate),
        status,
        entityLabel: ins.truck.plateNumber,
        actionUrl: 'insurance',
      }
    })

    // ─── 2. Roadworthy Certificates ───
    const roadworthies = await db.roadworthyInspection.findMany({
      where: {
        certificateExpiry: { not: null },
      },
      select: {
        id: true,
        truckId: true,
        certificateNumber: true,
        result: true,
        certificateExpiry: true,
        truck: {
          select: { plateNumber: true },
        },
      },
    })

    const roadworthyItems: ExpiryItem[] = roadworthies
      .filter(rw => rw.certificateExpiry !== null)
      .map(rw => {
        const status = calculateExpiryStatus(rw.certificateExpiry!)
        return {
          type: 'roadworthy',
          id: rw.id,
          entityId: rw.truckId,
          name: rw.truck.plateNumber,
          description: `Roadworthy Cert #${rw.certificateNumber} (${rw.result === 'passed' ? 'Passed' : rw.result === 'conditional_pass' ? 'Conditional' : rw.result})`,
          expiryDate: rw.certificateExpiry!.toISOString(),
          daysRemaining: calculateDaysRemaining(rw.certificateExpiry!),
          status,
          entityLabel: rw.truck.plateNumber,
          actionUrl: 'roadworthy',
        }
      })

    // ─── 3. DVLA Registrations ───
    const dvlaRegistrations = await db.dvlaRegistration.findMany({
      where: {
        status: 'active',
      },
      select: {
        id: true,
        truckId: true,
        registrationNumber: true,
        expiryDate: true,
        truck: {
          select: { plateNumber: true },
        },
      },
    })

    const dvlaItems: ExpiryItem[] = dvlaRegistrations.map(dvla => {
      const status = calculateExpiryStatus(dvla.expiryDate)
      return {
        type: 'dvla',
        id: dvla.id,
        entityId: dvla.truckId,
        name: dvla.truck.plateNumber,
        description: `DVLA Registration #${dvla.registrationNumber}`,
        expiryDate: dvla.expiryDate.toISOString(),
        daysRemaining: calculateDaysRemaining(dvla.expiryDate),
        status,
        entityLabel: dvla.truck.plateNumber,
        actionUrl: 'dvla',
      }
    })

    // ─── 4. Driver Licenses ───
    const drivers = await db.driver.findMany({
      where: {
        status: 'active',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        licenseNumber: true,
        licenseExpiry: true,
        ghanaCardNumber: true,
        ghanaCardExpiry: true,
      },
    })

    const driverLicenseItems: ExpiryItem[] = drivers.map(d => {
      const status = calculateExpiryStatus(d.licenseExpiry)
      return {
        type: 'driverLicenses',
        id: d.id,
        entityId: d.id,
        name: `${d.firstName} ${d.lastName}`,
        description: `License #${d.licenseNumber}`,
        expiryDate: d.licenseExpiry.toISOString(),
        daysRemaining: calculateDaysRemaining(d.licenseExpiry),
        status,
        entityLabel: `${d.firstName} ${d.lastName}`,
        actionUrl: 'drivers',
      }
    })

    // ─── 5. Ghana Cards ───
    const ghanaCardItems: ExpiryItem[] = drivers
      .filter(d => d.ghanaCardExpiry !== null)
      .map(d => {
        const status = calculateExpiryStatus(d.ghanaCardExpiry!)
        return {
          type: 'ghanaCards',
          id: d.id,
          entityId: d.id,
          name: `${d.firstName} ${d.lastName}`,
          description: `Ghana Card #${d.ghanaCardNumber || 'N/A'}`,
          expiryDate: d.ghanaCardExpiry!.toISOString(),
          daysRemaining: calculateDaysRemaining(d.ghanaCardExpiry!),
          status,
          entityLabel: `${d.firstName} ${d.lastName}`,
          actionUrl: 'drivers',
        }
      })

    // ─── Build categories ───
    const insuranceFiltered = filterByDaysAhead(insuranceItems, daysAhead)
    const roadworthyFiltered = filterByDaysAhead(roadworthyItems, daysAhead)
    const dvlaFiltered = filterByDaysAhead(dvlaItems, daysAhead)
    const licenseFiltered = filterByDaysAhead(driverLicenseItems, daysAhead)
    const ghanaCardFiltered = filterByDaysAhead(ghanaCardItems, daysAhead)

    const categories = {
      insurance: summarizeCategory(insuranceFiltered),
      roadworthy: summarizeCategory(roadworthyFiltered),
      dvla: summarizeCategory(dvlaFiltered),
      driverLicenses: summarizeCategory(licenseFiltered),
      ghanaCards: summarizeCategory(ghanaCardFiltered),
    }

    // ─── Flatten and sort all items by urgency ───
    const allItems = [
      ...insuranceFiltered,
      ...roadworthyFiltered,
      ...dvlaFiltered,
      ...licenseFiltered,
      ...ghanaCardFiltered,
    ].sort((a, b) => a.daysRemaining - b.daysRemaining)

    // ─── Summary ───
    const summary = {
      total: allItems.length,
      expired: allItems.filter(i => i.status === 'expired').length,
      critical: allItems.filter(i => i.status === 'critical').length,
      warning: allItems.filter(i => i.status === 'warning').length,
      valid: allItems.filter(i => i.status === 'valid').length,
    }

    return NextResponse.json({
      summary,
      categories,
      allItems,
    })
  } catch (error) {
    console.error('Compliance expiry dashboard error:', error)
    return NextResponse.json(
      { error: 'Failed to load compliance expiry dashboard' },
      { status: 500 }
    )
  }
}
