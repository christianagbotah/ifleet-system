import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const inspection = await db.roadworthyInspection.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    if (!inspection) {
      return NextResponse.json({ error: 'Roadworthy inspection not found' }, { status: 404 })
    }

    return NextResponse.json(inspection)
  } catch (error) {
    console.error('Roadworthy inspection detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch roadworthy inspection' }, { status: 500 })
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

    const inspection = await db.roadworthyInspection.findUnique({ where: { id } })
    if (!inspection) {
      return NextResponse.json({ error: 'Roadworthy inspection not found' }, { status: 404 })
    }

    const {
      truckId,
      certificateNumber,
      inspectionType,
      inspectionDate,
      result,
      inspectionStation,
      inspectorName,
      inspectorId,
      inspectorSignature,
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
      status,
    } = body

    // Check certificate number uniqueness if changing
    if (certificateNumber && certificateNumber !== inspection.certificateNumber) {
      const existing = await db.roadworthyInspection.findUnique({ where: { certificateNumber } })
      if (existing) {
        return NextResponse.json({ error: 'Roadworthy inspection with this certificate number already exists' }, { status: 400 })
      }
    }

    const updatedInspection = await db.roadworthyInspection.update({
      where: { id },
      data: {
        ...(truckId !== undefined && { truckId }),
        ...(certificateNumber !== undefined && { certificateNumber }),
        ...(inspectionType !== undefined && { inspectionType }),
        ...(inspectionDate !== undefined && { inspectionDate: new Date(inspectionDate) }),
        ...(result !== undefined && { result }),
        ...(inspectionStation !== undefined && { inspectionStation }),
        ...(inspectorName !== undefined && { inspectorName }),
        ...(inspectorId !== undefined && { inspectorId }),
        ...(inspectorSignature !== undefined && { inspectorSignature }),
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
        ...(status !== undefined && { status }),
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    return NextResponse.json(updatedInspection)
  } catch (error) {
    console.error('Roadworthy inspection update error:', error)
    return NextResponse.json({ error: 'Failed to update roadworthy inspection' }, { status: 500 })
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

    const inspection = await db.roadworthyInspection.findUnique({ where: { id } })
    if (!inspection) {
      return NextResponse.json({ error: 'Roadworthy inspection not found' }, { status: 404 })
    }

    await db.roadworthyInspection.delete({ where: { id } })

    return NextResponse.json({ message: 'Roadworthy inspection deleted successfully' })
  } catch (error) {
    console.error('Roadworthy inspection delete error:', error)
    return NextResponse.json({ error: 'Failed to delete roadworthy inspection' }, { status: 500 })
  }
}
