import { NextRequest, NextResponse } from 'next/server'
import { requireRole, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const page = parseInt(searchParams.get('page') || '1')

    const where: Prisma.ReportHistoryWhereInput = {}
    if (type) {
      where.type = type
    }

    const [reports, total] = await Promise.all([
      db.reportHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.reportHistory.count({ where }),
    ])

    return NextResponse.json({
      data: reports.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        format: r.format,
        parameters: r.parameters,
        generatedBy: r.generatedBy,
        fileSize: r.fileSize ? formatFileSize(r.fileSize) : null,
        status: r.status,
        error: r.error,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    })
  } catch (error) {
    console.error('[Reports] History fetch failed:', error)
    return NextResponse.json({ error: 'Failed to fetch report history' }, { status: 500 })
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
