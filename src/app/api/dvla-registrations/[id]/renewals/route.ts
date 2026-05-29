import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/dvla-registrations/[id]/renewals — List renewal history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const registration = await db.dvlaRegistration.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })
    if (!registration) {
      return NextResponse.json({ error: 'DVLA registration not found' }, { status: 404 })
    }

    const history = await db.dvlaRenewalHistory.findMany({
      where: { dvlaRegistrationId: id },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ data: history })
  } catch (error) {
    console.error('DVLA renewal history error:', error)
    return NextResponse.json({ error: 'Failed to fetch renewal history' }, { status: 500 })
  }
}

// POST /api/dvla-registrations/[id]/renewals — Create renewal (snapshot + update)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = await request.json()

    const registration = await db.dvlaRegistration.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })
    if (!registration) {
      return NextResponse.json({ error: 'DVLA registration not found' }, { status: 404 })
    }

    const {
      expiryDate,
      certificateNumber,
      registrationFee,
      renewalFee,
      status,
      notes,
    } = body

    if (!expiryDate) {
      return NextResponse.json({ error: 'New expiry date is required' }, { status: 400 })
    }

    // If certificate number is changing, check uniqueness
    if (certificateNumber && certificateNumber !== registration.certificateNumber) {
      const existing = await db.dvlaRegistration.findUnique({ where: { certificateNumber } })
      if (existing) {
        return NextResponse.json({ error: 'Certificate number already in use' }, { status: 400 })
      }
    }

    // 1. Snapshot the current state as JSON
    const previousData = JSON.stringify({
      registrationNumber: registration.registrationNumber,
      certificateNumber: registration.certificateNumber,
      vehicleClass: registration.vehicleClass,
      bodyType: registration.bodyType,
      registeredOwner: registration.registeredOwner,
      registrationDate: registration.registrationDate,
      expiryDate: registration.expiryDate,
      lastRenewalDate: registration.lastRenewalDate,
      nextRenewalDue: registration.nextRenewalDue,
      registrationFee: registration.registrationFee,
      renewalFee: registration.renewalFee,
      status: registration.status,
      dvlaOffice: registration.dvlaOffice,
      notes: registration.notes,
      truck: registration.truck,
    })

    // 2. Create history entry
    await db.dvlaRenewalHistory.create({
      data: {
        dvlaRegistrationId: id,
        previousData,
        renewalFee: renewalFee ? parseFloat(renewalFee) : null,
        renewedByName: auth.user?.name || null,
        notes: notes || null,
      },
    })

    // 3. Update the registration
    const updatedRegistration = await db.dvlaRegistration.update({
      where: { id },
      data: {
        expiryDate: new Date(expiryDate),
        ...(certificateNumber && certificateNumber !== registration.certificateNumber && { certificateNumber }),
        ...(registrationFee !== undefined && { registrationFee: registrationFee ? parseFloat(registrationFee) : null }),
        ...(renewalFee !== undefined && { renewalFee: renewalFee ? parseFloat(renewalFee) : null }),
        ...(status && { status }),
        lastRenewalDate: new Date(),
        ...(notes !== undefined && { notes }),
        status: status || 'active',
        reminderSent: false,
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    return NextResponse.json(updatedRegistration)
  } catch (error) {
    console.error('DVLA renewal error:', error)
    return NextResponse.json({ error: 'Failed to renew DVLA registration' }, { status: 500 })
  }
}
