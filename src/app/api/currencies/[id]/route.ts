import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, ROLES } from '@/lib/auth-server'

// GET /api/currencies/:id — Get single currency
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const { id } = await params

    const currency = await db.currency.findUnique({ where: { id } })

    if (!currency) {
      return NextResponse.json(
        { error: 'Currency not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(currency)
  } catch (error) {
    console.error('Currency detail error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch currency' },
      { status: 500 }
    )
  }
}

// PUT /api/currencies/:id — Update currency
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const { id } = await params
    const body = await request.json()

    const currency = await db.currency.findUnique({ where: { id } })
    if (!currency) {
      return NextResponse.json(
        { error: 'Currency not found' },
        { status: 404 }
      )
    }

    const { code, name, symbol, isActive, isDefault, position } = body

    // Validate code if provided
    if (code !== undefined) {
      const upperCode = code.toUpperCase().trim()
      if (!upperCode) {
        return NextResponse.json(
          { error: 'Currency code cannot be empty' },
          { status: 400 }
        )
      }
      if (upperCode.length > 3) {
        return NextResponse.json(
          { error: 'Currency code must be at most 3 characters' },
          { status: 400 }
        )
      }
      // Check uniqueness if code changed
      if (upperCode !== currency.code) {
        const existing = await db.currency.findUnique({ where: { code: upperCode } })
        if (existing) {
          return NextResponse.json(
            { error: 'Currency with this code already exists' },
            { status: 409 }
          )
        }
      }
    }

    // Validate symbol if provided
    if (symbol !== undefined && symbol.length > 5) {
      return NextResponse.json(
        { error: 'Currency symbol must be at most 5 characters' },
        { status: 400 }
      )
    }

    // If setting as default, unset all other defaults first
    if (isDefault === true && !currency.isDefault) {
      await db.currency.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      })
    }

    const updatedCurrency = await db.currency.update({
      where: { id },
      data: {
        ...(code !== undefined && { code: code.toUpperCase().trim() }),
        ...(name !== undefined && { name: name.trim() }),
        ...(symbol !== undefined && { symbol }),
        ...(isActive !== undefined && { isActive }),
        ...(isDefault !== undefined && { isDefault }),
        ...(position !== undefined && { position }),
      },
    })

    return NextResponse.json(updatedCurrency)
  } catch (error) {
    console.error('Currency update error:', error)
    return NextResponse.json(
      { error: 'Failed to update currency' },
      { status: 500 }
    )
  }
}

// DELETE /api/currencies/:id — Permanently delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const { id } = await params

    const currency = await db.currency.findUnique({ where: { id } })
    if (!currency) {
      return NextResponse.json(
        { error: 'Currency not found' },
        { status: 404 }
      )
    }

    // Cannot delete the default currency
    if (currency.isDefault) {
      return NextResponse.json(
        { error: 'Cannot delete the default currency. Set another currency as default first.' },
        { status: 400 }
      )
    }

    await db.currency.delete({ where: { id } })

    return NextResponse.json({ success: true, id, message: 'Currency deleted permanently' })
  } catch (error) {
    console.error('Currency delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete currency' },
      { status: 500 }
    )
  }
}
