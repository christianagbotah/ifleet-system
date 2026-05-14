import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get('truckId')
    const status = searchParams.get('status')
    const vehicleClass = searchParams.get('vehicleClass')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (truckId) where.truckId = truckId
    if (status) where.status = status
    if (vehicleClass) where.vehicleClass = vehicleClass
    if (search) {
      where.OR = [
        { registrationNumber: { contains: search } },
        { certificateNumber: { contains: search } },
        { registeredOwner: { contains: search } },
      ]
    }

    const [registrations, total] = await Promise.all([
      db.dvlaRegistration.findMany({
        where,
        include: {
          truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.dvlaRegistration.count({ where }),
    ])

    return NextResponse.json({ data: registrations, total, page, limit })
  } catch (error) {
    console.error('DVLA registration list error:', error)
    return NextResponse.json({ error: 'Failed to fetch DVLA registrations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()

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
      notes,
    } = body

    if (
      !truckId ||
      !registrationNumber ||
      !certificateNumber ||
      !vehicleClass ||
      !registeredOwner ||
      !registrationDate ||
      !expiryDate
    ) {
      return NextResponse.json(
        { error: 'truckId, registrationNumber, certificateNumber, vehicleClass, registeredOwner, registrationDate, and expiryDate are required' },
        { status: 400 }
      )
    }

    // Verify truck exists
    const truck = await db.truck.findUnique({ where: { id: truckId } })
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    // Check for duplicate registration number
    const existingReg = await db.dvlaRegistration.findUnique({ where: { registrationNumber } })
    if (existingReg) {
      return NextResponse.json({ error: 'DVLA registration with this registration number already exists' }, { status: 400 })
    }

    // Check for duplicate certificate number
    const existingCert = await db.dvlaRegistration.findUnique({ where: { certificateNumber } })
    if (existingCert) {
      return NextResponse.json({ error: 'DVLA registration with this certificate number already exists' }, { status: 400 })
    }

    const registration = await db.dvlaRegistration.create({
      data: {
        truckId,
        registrationNumber,
        certificateNumber,
        vehicleClass,
        registeredOwner,
        registrationDate: new Date(registrationDate),
        expiryDate: new Date(expiryDate),
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
        ...(notes !== undefined && { notes }),
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    return NextResponse.json(registration, { status: 201 })
  } catch (error) {
    console.error('DVLA registration create error:', error)
    return NextResponse.json({ error: 'Failed to create DVLA registration' }, { status: 500 })
  }
}
