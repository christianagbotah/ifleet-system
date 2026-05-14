import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/auth-server'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthContext(request)
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || undefined
    const entityType = searchParams.get('entityType') || undefined
    const entityId = searchParams.get('entityId') || undefined
    const search = searchParams.get('search') || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

    // Build where clause
    const where: Prisma.DocumentWhereInput = {}
    if (category) where.category = category
    if (entityType) where.entityType = entityType
    if (entityId) where.entityId = entityId
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { fileName: { contains: search } },
        { description: { contains: search } },
      ]
    }

    // Drivers can only see their own documents unless admin/manager
    if (auth.roleName === 'Driver') {
      where.uploadedBy = auth.userId
    }

    const [documents, total] = await Promise.all([
      db.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.document.count({ where }),
    ])

    // Get summary by category
    const summary = await db.document.groupBy({
      by: ['category'],
      where,
      _count: true,
    })

    const summaryMap: Record<string, number> = {}
    for (const item of summary) {
      summaryMap[item.category] = item._count
    }

    return NextResponse.json({
      data: documents,
      total,
      page,
      limit,
      summary: summaryMap,
    })
  } catch (error) {
    console.error('Document list error:', error)
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
  }
}
