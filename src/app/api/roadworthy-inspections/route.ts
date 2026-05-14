import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get('truckId')
    const result = searchParams.get('result')
    const vehicleFitness = searchParams.get('vehicleFitness')
    const inspectionType = searchParams.get('inspectionType')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (truckId) where.truckId = truckId
    if (result) where.result = result
    if (vehicleFitness) where.vehicleFitness = vehicleFitness
    if (inspectionType) where.inspectionType = inspectionType
    if (status) where.status = status

    const [inspections, total] = await Promise.all([
      db.roadworthyInspection.findMany({
        where,
        include: {
          truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.roadworthyInspection.count({ where }),
    ])

    return NextResponse.json({ data: inspections, total, page, limit })
  } catch (error) {
    console.error('Roadworthy inspection list error:', error)
    return NextResponse.json({ error: 'Failed to fetch roadworthy inspections' }, { status: 500 })
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
      certificateNumber,
      inspectionType,
      inspectionDate,
      result,
      inspectionStation,
      inspectorName,
      inspectorId,
      brakesCheck,
      lightsCheck,
      tyresCheck,
      emissionsCheck,
      steeringCheck,
      suspensionCheck,
      bodyCheck,
      electricalCheck,
      odometerReading,
      defectsFound,
      advisories,
      recommendations,
      vehicleFitness,
      certificateIssued,
      certificateExpiry,
      certificateUrl,
      inspectionFee,
      nextInspectionDue,
    } = body

    if (!truckId || !certificateNumber || !inspectionType || !inspectionDate || !result) {
      return NextResponse.json(
        { error: 'truckId, certificateNumber, inspectionType, inspectionDate, and result are required' },
        { status: 400 }
      )
    }

    // Verify truck exists
    const truck = await db.truck.findUnique({ where: { id: truckId } })
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    // Check for duplicate certificate number
    const existing = await db.roadworthyInspection.findUnique({ where: { certificateNumber } })
    if (existing) {
      return NextResponse.json({ error: 'Roadworthy inspection with this certificate number already exists' }, { status: 400 })
    }

    const inspection = await db.roadworthyInspection.create({
      data: {
        truckId,
        certificateNumber,
        inspectionType,
        inspectionDate: new Date(inspectionDate),
        result,
        ...(inspectionStation !== undefined && { inspectionStation }),
        ...(inspectorName !== undefined && { inspectorName }),
        ...(inspectorId !== undefined && { inspectorId }),
        ...(brakesCheck !== undefined && { brakesCheck }),
        ...(lightsCheck !== undefined && { lightsCheck }),
        ...(tyresCheck !== undefined && { tyresCheck }),
        ...(emissionsCheck !== undefined && { emissionsCheck }),
        ...(steeringCheck !== undefined && { steeringCheck }),
        ...(suspensionCheck !== undefined && { suspensionCheck }),
        ...(bodyCheck !== undefined && { bodyCheck }),
        ...(electricalCheck !== undefined && { electricalCheck }),
        ...(odometerReading !== undefined && { odometerReading: odometerReading ? parseFloat(odometerReading) : null }),
        ...(defectsFound !== undefined && { defectsFound }),
        ...(advisories !== undefined && { advisories }),
        ...(recommendations !== undefined && { recommendations }),
        ...(vehicleFitness !== undefined && { vehicleFitness }),
        ...(certificateIssued !== undefined && { certificateIssued: Boolean(certificateIssued) }),
        ...(certificateExpiry !== undefined && { certificateExpiry: certificateExpiry ? new Date(certificateExpiry) : null }),
        ...(certificateUrl !== undefined && { certificateUrl }),
        ...(inspectionFee !== undefined && { inspectionFee: inspectionFee ? parseFloat(inspectionFee) : null }),
        ...(nextInspectionDue !== undefined && { nextInspectionDue: nextInspectionDue ? new Date(nextInspectionDue) : null }),
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    return NextResponse.json(inspection, { status: 201 })
  } catch (error) {
    console.error('Roadworthy inspection create error:', error)
    return NextResponse.json({ error: 'Failed to create roadworthy inspection' }, { status: 500 })
  }
}
