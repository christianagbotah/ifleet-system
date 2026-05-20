import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const warehouses = await db.warehouse.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(warehouses)
  } catch (error) {
    console.error('Error fetching warehouses:', error)
    return NextResponse.json(
      { error: 'Failed to fetch warehouses' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { name, code, address, city, region, contactPerson, contactPhone, isActive, notes } = body

    if (!name || !code) {
      return NextResponse.json(
        { error: 'Missing required fields: name, code' },
        { status: 400 }
      )
    }

    const warehouse = await db.warehouse.create({
      data: {
        name,
        code,
        address: address || '',
        city: city || '',
        region: region || '',
        contactPerson: contactPerson || null,
        contactPhone: contactPhone || null,
        isActive: isActive !== undefined ? isActive : true,
        notes: notes || '',
      },
    })

    return NextResponse.json(warehouse, { status: 201 })
  } catch (error) {
    console.error('Error creating warehouse:', error)
    return NextResponse.json(
      { error: 'Failed to create warehouse', details: String(error) },
      { status: 500 }
    )
  }
}
