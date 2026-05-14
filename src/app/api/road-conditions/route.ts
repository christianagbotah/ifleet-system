import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const region = searchParams.get('region')
    const condition = searchParams.get('condition')
    const severity = searchParams.get('severity')
    const status = searchParams.get('status')
    const hazardType = searchParams.get('hazardType')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (region) where.region = region
    if (condition) where.condition = condition
    if (severity) where.severity = severity
    if (status) where.status = status
    if (hazardType) where.hazardType = hazardType

    if (dateFrom || dateTo) {
      where.reportedAt = {} as Record<string, unknown>
      if (dateFrom) (where.reportedAt as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.reportedAt as Record<string, unknown>).lte = new Date(dateTo)
    }

    const [records, total] = await Promise.all([
      db.roadConditionReport.findMany({
        where,
        include: {
          reporter: { select: { id: true, name: true, email: true } },
          trip: { select: { id: true, tripNumber: true } },
        },
        orderBy: { reportedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.roadConditionReport.count({ where }),
    ])

    return NextResponse.json({ data: records, total, page, limit })
  } catch (error) {
    console.error('Road conditions list error:', error)
    return NextResponse.json({ error: 'Failed to fetch road conditions' }, { status: 500 })
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
      roadName,
      region,
      condition,
      hazardType,
      description,
      severity,
      latitude,
      longitude,
      imageUrl,
      tripId,
    } = body

    if (!roadName || !region || !condition || !severity) {
      return NextResponse.json(
        { error: 'roadName, region, condition, and severity are required' },
        { status: 400 }
      )
    }

    const validConditions = ['good', 'fair', 'poor', 'blocked']
    if (!validConditions.includes(condition)) {
      return NextResponse.json(
        { error: 'condition must be one of: good, fair, poor, blocked' },
        { status: 400 }
      )
    }

    const validHazards = ['pothole', 'flood', 'accident', 'construction', 'erosion', 'none']
    if (hazardType && !validHazards.includes(hazardType)) {
      return NextResponse.json(
        { error: 'hazardType must be one of: pothole, flood, accident, construction, erosion, none' },
        { status: 400 }
      )
    }

    const validSeverities = ['low', 'medium', 'high', 'critical']
    if (!validSeverities.includes(severity)) {
      return NextResponse.json(
        { error: 'severity must be one of: low, medium, high, critical' },
        { status: 400 }
      )
    }

    const record = await db.roadConditionReport.create({
      data: {
        reporterId: auth.userId,
        roadName,
        region,
        condition,
        hazardType: hazardType || 'none',
        description: description || null,
        severity,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        imageUrl: imageUrl || null,
        tripId: tripId || null,
      },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        trip: { select: { id: true, tripNumber: true } },
      },
    })

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Road condition create error:', error)
    return NextResponse.json({ error: 'Failed to create road condition report' }, { status: 500 })
  }
}
