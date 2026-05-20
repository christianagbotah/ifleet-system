import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

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

    return NextResponse.json(registration)
  } catch (error) {
    console.error('DVLA registration detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch DVLA registration' }, { status: 500 })
  }
}

export async function PUT(
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

    const registration = await db.dvlaRegistration.findUnique({ where: { id } })
    if (!registration) {
      return NextResponse.json({ error: 'DVLA registration not found' }, { status: 404 })
    }

    const {
      truckId,
      registrationNumber,
      certificateNumber,
      vehicleClass,
      registeredOwner,
      registrationDate,
      expiryDate,
      bodyType,
      axleConfiguration,
      grossVehicleWeight,
      unladenWeight,
      seatingCapacity,
      engineCapacity,
      yearOfManufacture,
      countryOfOrigin,
      ownerAddress,
      ownerContact,
      dvlaOffice,
      lastRenewalDate,
      nextRenewalDue,
      registrationFee,
      renewalFee,
      status,
      documentUrl,
      transferHistory,
      notes,
    } = body

    // Check registration number uniqueness if changing
    if (registrationNumber && registrationNumber !== registration.registrationNumber) {
      const existingReg = await db.dvlaRegistration.findUnique({ where: { registrationNumber } })
      if (existingReg) {
        return NextResponse.json({ error: 'DVLA registration with this registration number already exists' }, { status: 400 })
      }
    }

    // Check certificate number uniqueness if changing
    if (certificateNumber && certificateNumber !== registration.certificateNumber) {
      const existingCert = await db.dvlaRegistration.findUnique({ where: { certificateNumber } })
      if (existingCert) {
        return NextResponse.json({ error: 'DVLA registration with this certificate number already exists' }, { status: 400 })
      }
    }

    const updatedRegistration = await db.dvlaRegistration.update({
      where: { id },
      data: {
        ...(truckId !== undefined && { truckId }),
        ...(registrationNumber !== undefined && { registrationNumber }),
        ...(certificateNumber !== undefined && { certificateNumber }),
        ...(vehicleClass !== undefined && { vehicleClass }),
        ...(registeredOwner !== undefined && { registeredOwner }),
        ...(registrationDate !== undefined && { registrationDate: new Date(registrationDate) }),
        ...(expiryDate !== undefined && { expiryDate: new Date(expiryDate) }),
        ...(bodyType !== undefined && { bodyType }),
        ...(axleConfiguration !== undefined && { axleConfiguration }),
        ...(grossVehicleWeight !== undefined && { grossVehicleWeight: grossVehicleWeight ? parseFloat(grossVehicleWeight) : null }),
        ...(unladenWeight !== undefined && { unladenWeight: unladenWeight ? parseFloat(unladenWeight) : null }),
        ...(seatingCapacity !== undefined && { seatingCapacity: seatingCapacity ? parseInt(seatingCapacity) : null }),
        ...(engineCapacity !== undefined && { engineCapacity }),
        ...(yearOfManufacture !== undefined && { yearOfManufacture: yearOfManufacture ? parseInt(yearOfManufacture) : null }),
        ...(countryOfOrigin !== undefined && { countryOfOrigin }),
        ...(ownerAddress !== undefined && { ownerAddress }),
        ...(ownerContact !== undefined && { ownerContact }),
        ...(dvlaOffice !== undefined && { dvlaOffice }),
        ...(lastRenewalDate !== undefined && { lastRenewalDate: lastRenewalDate ? new Date(lastRenewalDate) : null }),
        ...(nextRenewalDue !== undefined && { nextRenewalDue: nextRenewalDue ? new Date(nextRenewalDue) : null }),
        ...(registrationFee !== undefined && { registrationFee: registrationFee ? parseFloat(registrationFee) : null }),
        ...(renewalFee !== undefined && { renewalFee: renewalFee ? parseFloat(renewalFee) : null }),
        ...(status !== undefined && { status }),
        ...(documentUrl !== undefined && { documentUrl }),
        ...(transferHistory !== undefined && { transferHistory }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    return NextResponse.json(updatedRegistration)
  } catch (error) {
    console.error('DVLA registration update error:', error)
    return NextResponse.json({ error: 'Failed to update DVLA registration' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params

    const registration = await db.dvlaRegistration.findUnique({ where: { id } })
    if (!registration) {
      return NextResponse.json({ error: 'DVLA registration not found' }, { status: 404 })
    }

    await db.dvlaRegistration.delete({ where: { id } })

    return NextResponse.json({ message: 'DVLA registration deleted successfully' })
  } catch (error) {
    console.error('DVLA registration delete error:', error)
    return NextResponse.json({ error: 'Failed to delete DVLA registration' }, { status: 500 })
  }
}
