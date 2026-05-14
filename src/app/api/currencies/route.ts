import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, ROLES } from '@/lib/auth-server'

// Default exchange rates (relative to GHS as base)
const DEFAULT_EXCHANGE_RATES = {
  GHS: 1,
  USD: 1 / 14.5,
  XOF: 1 / 41.4,
}

// GET /api/currencies — List all currencies ordered by position, then code
export async function GET(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const currencies = await db.currency.findMany({
      orderBy: [{ position: 'asc' }, { code: 'asc' }],
    })

    return NextResponse.json(currencies)
  } catch (error) {
    console.error('Currencies list error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch currencies' },
      { status: 500 }
    )
  }
}

// POST /api/currencies — Create a new currency
export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const body = await request.json()
    const { code, name, symbol, isActive, isDefault } = body

    // Validate required fields
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Currency code is required' },
        { status: 400 }
      )
    }

    const upperCode = code.toUpperCase().trim()

    if (upperCode.length > 3) {
      return NextResponse.json(
        { error: 'Currency code must be at most 3 characters' },
        { status: 400 }
      )
    }

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { error: 'Currency name is required' },
        { status: 400 }
      )
    }

    if (!symbol || typeof symbol !== 'string') {
      return NextResponse.json(
        { error: 'Currency symbol is required' },
        { status: 400 }
      )
    }

    if (symbol.length > 5) {
      return NextResponse.json(
        { error: 'Currency symbol must be at most 5 characters' },
        { status: 400 }
      )
    }

    // Check uniqueness
    const existing = await db.currency.findUnique({ where: { code: upperCode } })
    if (existing) {
      return NextResponse.json(
        { error: 'Currency with this code already exists' },
        { status: 409 }
      )
    }

    // If setting as default, unset all other defaults first
    if (isDefault === true) {
      await db.currency.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      })
    }

    // Get next position if not provided
    const maxPosition = await db.currency.aggregate({ _max: { position: true } })
    const nextPosition = (maxPosition._max.position ?? -1) + 1

    const currency = await db.currency.create({
      data: {
        code: upperCode,
        name: name.trim(),
        symbol,
        isActive: isActive !== undefined ? isActive : true,
        isDefault: isDefault === true,
        position: nextPosition,
      },
    })

    return NextResponse.json(currency, { status: 201 })
  } catch (error) {
    console.error('Currency create error:', error)
    return NextResponse.json(
      { error: 'Failed to create currency' },
      { status: 500 }
    )
  }
}

// PUT /api/currencies — Update exchange rates (admin only)
export async function PUT(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const body = await request.json()

    // Support exchange rate updates
    if (body.exchangeRates && Array.isArray(body.exchangeRates)) {
      const rates = body.exchangeRates

      // Validate rates structure
      for (const rate of rates) {
        if (!rate.code || typeof rate.code !== 'string') {
          return NextResponse.json(
            { error: 'Each exchange rate must have a valid code' },
            { status: 400 }
          )
        }
        if (typeof rate.rateToBase !== 'number' || rate.rateToBase < 0) {
          return NextResponse.json(
            { error: `Invalid rate for ${rate.code}` },
            { status: 400 }
          )
        }
      }

      // Return success — rates are primarily persisted client-side via localStorage
      // This endpoint validates and acknowledges the update
      return NextResponse.json({
        success: true,
        exchangeRates: rates,
        baseCurrency: body.baseCurrency || 'GHS',
        message: 'Exchange rates updated successfully',
      })
    }

    // If no exchange rates, this is likely a different PUT operation
    return NextResponse.json(
      { error: 'Invalid request body. Expected { exchangeRates, baseCurrency }' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Exchange rates update error:', error)
    return NextResponse.json(
      { error: 'Failed to update exchange rates' },
      { status: 500 }
    )
  }
}
