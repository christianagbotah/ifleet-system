import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

// In-memory cache to avoid hammering the external API
let cachedRates: {
  rates: Record<string, number>
  base: string
  timestamp: number
} | null = null

const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

// Supported currencies for the fleet management system
const SUPPORTED_CURRENCIES = ['GHS', 'USD', 'EUR', 'GBP', 'XOF', 'NGN', 'CNY']

// Currency metadata
const CURRENCY_META: Record<string, { name: string; symbol: string }> = {
  GHS: { name: 'Ghana Cedi', symbol: '\u20B5' },
  USD: { name: 'US Dollar', symbol: '$' },
  EUR: { name: 'Euro', symbol: '€' },
  GBP: { name: 'British Pound', symbol: '£' },
  XOF: { name: 'West African CFA', symbol: 'CFA' },
  NGN: { name: 'Nigerian Naira', symbol: '₦' },
  CNY: { name: 'Chinese Yuan', symbol: '¥' },
}

/**
 * GET /api/exchange-rates/live?base=GHS
 * Fetches live exchange rates from open.er-api.com (free, no API key)
 * Results are cached for 10 minutes to reduce external API calls.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const base = (searchParams.get('base') || 'GHS').toUpperCase()

    // Validate base currency
    if (!SUPPORTED_CURRENCIES.includes(base)) {
      return NextResponse.json(
        { error: `Unsupported base currency: ${base}. Supported: ${SUPPORTED_CURRENCIES.join(', ')}` },
        { status: 400 }
      )
    }

    // Check cache
    if (cachedRates && cachedRates.base === base && (Date.now() - cachedRates.timestamp) < CACHE_TTL_MS) {
      return NextResponse.json({
        ...buildResponse(base, cachedRates.rates),
        cached: true,
      })
    }

    // Fetch from external API
    const apiUrl = `https://open.er-api.com/v6/latest/${base}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000) // 8s timeout

    let response: Response
    try {
      response = await fetch(apiUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      })
    } catch (fetchErr) {
      clearTimeout(timeout)
      // If we have stale cache, return it
      if (cachedRates && cachedRates.base === base) {
        return NextResponse.json({
          ...buildResponse(base, cachedRates.rates),
          cached: true,
          stale: true,
          warning: 'Using cached rates — live API unavailable',
        })
      }
      return NextResponse.json(
        { error: 'Failed to fetch live exchange rates. Please try again later.' },
        { status: 502 }
      )
    }

    clearTimeout(timeout)

    if (!response.ok) {
      // Return stale cache if available
      if (cachedRates && cachedRates.base === base) {
        return NextResponse.json({
          ...buildResponse(base, cachedRates.rates),
          cached: true,
          stale: true,
          warning: `External API returned ${response.status}. Using cached rates.`,
        })
      }
      return NextResponse.json(
        { error: `Exchange rate API returned ${response.status}` },
        { status: 502 }
      )
    }

    const data = await response.json()

    if (data.result !== 'success' || !data.rates) {
      return NextResponse.json(
        { error: 'Invalid response from exchange rate provider' },
        { status: 502 }
      )
    }

    const rates = data.rates as Record<string, number>

    // Update cache
    cachedRates = {
      rates,
      base,
      timestamp: Date.now(),
    }

    const result = buildResponse(base, rates)

    // Audit log
    createAuditLog({
      userId: auth.userId,
      action: 'read',
      entity: 'ExchangeRate',
      entityId: `live-${base}`,
      details: {
        base,
        currencies: SUPPORTED_CURRENCIES.filter(c => c !== base),
        source: 'open.er-api.com',
        cached: false,
      },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(result)
  } catch (error) {
    console.error('Live exchange rates error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch live exchange rates' },
      { status: 500 }
    )
  }
}

interface LiveRateItem {
  code: string
  name: string
  symbol: string
  rateToBase: number
  inverseRate: number
}

interface LiveRatesResponse {
  base: string
  timestamp: string
  source: string
  exchangeRates: LiveRateItem[]
  nextUpdate: string
}

function buildResponse(base: string, rates: Record<string, number>): LiveRatesResponse {
  const exchangeRates: LiveRateItem[] = []

  // Always include base currency
  const baseMeta = CURRENCY_META[base] || { name: base, symbol: base }
  exchangeRates.push({
    code: base,
    name: baseMeta.name,
    symbol: baseMeta.symbol,
    rateToBase: 1,
    inverseRate: 1,
  })

  // Add all supported currencies
  for (const code of SUPPORTED_CURRENCIES) {
    if (code === base) continue
    const rate = rates[code]
    if (rate === undefined) continue

    const meta = CURRENCY_META[code] || { name: code, symbol: code }
    exchangeRates.push({
      code,
      name: meta.name,
      symbol: meta.symbol,
      rateToBase: rate,
      inverseRate: rate > 0 ? Math.round((1 / rate) * 10000) / 10000 : 0,
    })
  }

  return {
    base,
    timestamp: new Date().toISOString(),
    source: 'open.er-api.com',
    exchangeRates,
    nextUpdate: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
  }
}
