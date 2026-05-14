import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get('truckId')
    const driverId = searchParams.get('driverId')
    const type = searchParams.get('type')
    const result = searchParams.get('result')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (truckId) where.truckId = truckId
    if (driverId) where.driverId = driverId
    if (type) where.type = type
    if (result) where.result = result

    if (dateFrom || dateTo) {
      where.inspectionDate = {}
      if (dateFrom) (where.inspectionDate as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.inspectionDate as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59')
    }

    const [records, total] = await Promise.all([
      db.vehicleInspection.findMany({
        where,
        include: {
          truck: { select: { id: true, plateNumber: true, make: true, model: true } },
          driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
          trip: { select: { id: true, tripNumber: true } },
        },
        orderBy: { inspectionDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.vehicleInspection.count({ where }),
    ])

    return NextResponse.json({ data: records, total, page, limit })
  } catch (error) {
    console.error('Inspections list error:', error)
    return NextResponse.json({ error: 'Failed to fetch inspections' }, { status: 500 })
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
      driverId,
      tripId,
      type,
      odometerReading,
      overallNotes,
      checkItems,
      photos,
      inspectorName,
      signature,
      location,
      latitude,
      longitude,
      requiresFollowUp,
      followUpNotes,
    } = body

    if (!truckId || !type) {
      return NextResponse.json(
        { error: 'truckId and type are required' },
        { status: 400 }
      )
    }

    if (!['pre_trip', 'post_trip'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be pre_trip or post_trip' },
        { status: 400 }
      )
    }

    // Verify truck exists
    const truck = await db.truck.findUnique({ where: { id: truckId } })
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    // Process checkItems to compute counts and result
    let parsedItems: { name: string; category: string; status: string; notes?: string; severity?: string }[] = []
    let totalChecks = 0
    let passCount = 0
    let warningCount = 0
    let failCount = 0
    let defectsFound = false
    let defectDetails: { item: string; severity: string; description: string; photoUrl?: string }[] = []

    if (Array.isArray(checkItems)) {
      parsedItems = checkItems
      totalChecks = parsedItems.length
      for (const item of parsedItems) {
        if (item.status === 'ok') passCount++
        else if (item.status === 'warning') warningCount++
        else if (item.status === 'fail') {
          failCount++
          defectsFound = true
          defectDetails.push({
            item: item.name,
            severity: item.severity || 'medium',
            description: item.notes || 'Failed check',
          })
        }
      }
    }

    // Determine overall result
    let result: string
    if (failCount > 0) {
      result = 'fail'
    } else if (warningCount > 0) {
      result = 'conditional_pass'
    } else {
      result = 'pass'
    }

    const record = await db.vehicleInspection.create({
      data: {
        truckId,
        driverId: driverId || null,
        tripId: tripId || null,
        type,
        odometerReading: odometerReading ? parseFloat(odometerReading) : null,
        result,
        overallNotes: overallNotes || null,
        checkItems: JSON.stringify(parsedItems),
        totalChecks,
        passCount,
        warningCount,
        failCount,
        defectsFound,
        defectDetails: defectDetails.length > 0 ? JSON.stringify(defectDetails) : null,
        photos: Array.isArray(photos) && photos.length > 0 ? JSON.stringify(photos) : null,
        inspectedBy: auth.userId,
        inspectorName: inspectorName || null,
        signature: signature || null,
        location: location || null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        requiresFollowUp: requiresFollowUp || defectsFound,
        followUpNotes: followUpNotes || null,
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
        trip: { select: { id: true, tripNumber: true } },
      },
    })

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Inspection create error:', error)
    return NextResponse.json({ error: 'Failed to create inspection' }, { status: 500 })
  }
}
