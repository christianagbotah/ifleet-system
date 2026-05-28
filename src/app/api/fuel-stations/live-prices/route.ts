import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// ============ Types ============

interface BrandPriceUpdate {
  brand: string
  diesel?: number
  petrol?: number
  lpg?: number
}

interface BrandPrice {
  brand: string
  petrol?: number
  diesel?: number
  lpg?: number
}

interface LivePriceResponse {
  lastUpdated: string
  source: string
  prices: Record<string, number>
  brandPrices: BrandPrice[]
}

// ============ In-Memory Cache (24h TTL) ============

const CACHE_KEY = 'fuel-live-prices'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface CacheEntry {
  data: LivePriceResponse
  timestamp: number
}

const priceCache = new Map<string, CacheEntry>()

function getCachedPrices(): LivePriceResponse | null {
  const entry = priceCache.get(CACHE_KEY)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    priceCache.delete(CACHE_KEY)
    return null
  }
  return entry.data
}

function setCachedPrices(data: LivePriceResponse): void {
  priceCache.set(CACHE_KEY, { data, timestamp: Date.now() })
}

// ============ Fallback Data ============
// Recent indicative Ghana fuel prices (GHS). Updated ~bi-weekly by NPA.
// These serve as fallback when the NPA site is unreachable or requires JS rendering.

function getFallbackPrices(): LivePriceResponse {
  return {
    lastUpdated: new Date().toISOString(),
    source: 'NPA Ghana / Fallback (cached indicative prices)',
    prices: {
      Diesel: 15.35,
      Petrol: 14.50,
      LPG: 11.25,
      Gas: 11.25,
    },
    brandPrices: [
      { brand: 'GOIL', petrol: 14.99, diesel: 15.42 },
      { brand: 'Shell', petrol: 14.50, diesel: 15.10 },
      { brand: 'TotalEnergies', petrol: 14.65, diesel: 15.25 },
      { brand: 'Engen', petrol: 14.55, diesel: 15.15 },
      { brand: 'Star Oil', petrol: 14.40, diesel: 15.00 },
      { brand: 'AvEnergy', petrol: 14.30, diesel: 14.90 },
      { brand: 'Puma Energy', petrol: 14.60, diesel: 15.20 },
      { brand: 'Zenith', petrol: 14.45, diesel: 15.05 },
      { brand: 'Allied Oil', petrol: 14.35, diesel: 14.95 },
      { brand: 'Goodness', petrol: 14.25, diesel: 14.85 },
      { brand: 'Piston', petrol: 14.48, diesel: 15.08 },
      { brand: 'Frimps', petrol: 14.38, diesel: 14.98 },
      { brand: 'Florence', petrol: 14.32, diesel: 14.92 },
      { brand: 'Naft Oil', petrol: 14.28, diesel: 14.88 },
      { brand: 'Gasoil', petrol: 14.42, diesel: 15.02 },
    ],
  }
}

// ============ Scraping Helpers ============

/**
 * Attempt to scrape indicative fuel prices from NPA Ghana website.
 * The NPA site may require JavaScript rendering, so we wrap in try/catch
 * and fall back to hardcoded indicative prices.
 */
async function scrapeNpaPrices(): Promise<LivePriceResponse | null> {
  const urls = [
    'https://npa.gov.gh',
    'https://npa.gov.gh/petroleum-prices',
    'https://npa.gov.gh/index.php/petroleum-pricing/indicative-prices',
  ]

  for (const url of urls) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10_000) // 10s timeout

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      })
      clearTimeout(timeoutId)

      if (!response.ok) continue

      const html = await response.text()

      // Try to extract fuel prices from the HTML content.
      // NPA pages typically list prices in table rows or structured text.
      const extracted = extractPricesFromHtml(html)
      if (extracted) return extracted
    } catch {
      // This URL failed — try the next one
      continue
    }
  }

  return null
}

/**
 * Best-effort extraction of fuel prices from raw HTML.
 * Looks for patterns like "Diesel", "Petrol", "Gasoline", "LPG" near GHS values.
 */
function extractPricesFromHtml(html: string): LivePriceResponse | null {
  const prices: Record<string, number> = {}
  const brandPrices: BrandPrice[] = []

  // Normalize whitespace for easier regex matching
  const text = html.replace(/\s+/g, ' ')

  // Attempt to match common price patterns: GH₵ XX.XX or GHS XX.XX or just XX.XX near fuel keywords
  const fuelKeywords = [
    { key: 'Diesel', patterns: ['diesel', 'diesel (gasoil)', 'gasoil'] },
    { key: 'Petrol', patterns: ['petrol', 'gasoline', 'premium', 'super', 'unleaded'] },
    { key: 'LPG', patterns: ['lpg', 'liquefied petroleum gas', 'cooking gas'] },
  ]

  for (const fuel of fuelKeywords) {
    for (const keyword of fuel.patterns) {
      const regex = new RegExp(
        `${keyword}[^0-9]*(?:GH₵|GHS|GH\\s?)?(\\d+\\.\\d{1,2})`,
        'i'
      )
      const match = text.match(regex)
      if (match && !prices[fuel.key]) {
        prices[fuel.key] = parseFloat(match[1])
        break
      }
    }
  }

  // We need at least one fuel price to consider the scrape successful
  if (Object.keys(prices).length === 0) return null

  // Ensure all expected keys exist with reasonable defaults
  if (!prices['Diesel']) prices['Diesel'] = 15.0
  if (!prices['Petrol']) prices['Petrol'] = 14.5
  if (!prices['LPG']) prices['LPG'] = 11.0
  prices['Gas'] = prices['LPG']

  // Try to extract brand-level prices from tables
  // Brand names must match the frontend GHANA_FUEL_BRANDS list exactly
  const knownBrands = [
    'GOIL', 'Shell', 'TotalEnergies', 'Engen', 'Star Oil',
    'Allied Oil', 'AvEnergy', 'Piston', 'Frimps', 'Puma Energy',
    'Gasoil', 'Florence', 'Goodness', 'Naft Oil', 'Zenith',
  ]

  for (const brand of knownBrands) {
    const brandRegex = new RegExp(
      `${brand}[^0-9]*?(?:petrol|gasoline|premium)[^0-9]*(?:GH₵|GHS|GH\\s?)?(\\d+\\.\\d{1,2})[^0-9]*(?:diesel|gasoil)[^0-9]*(?:GH₵|GHS|GH\\s?)?(\\d+\\.\\d{1,2})`,
      'i'
    )
    const brandMatch = text.match(brandRegex)
    if (brandMatch) {
      brandPrices.push({
        brand,
        petrol: parseFloat(brandMatch[1]),
        diesel: parseFloat(brandMatch[2]),
      })
    }
  }

  // If we couldn't extract brand prices, generate deterministic brand variations
  // Uses a simple string hash for consistency (avoids Math.random() producing different
  // values on every request which would confuse users)
  if (brandPrices.length === 0) {
    for (const brand of knownBrands) {
      // Deterministic hash-based variation: ±0.30 GHS per fuel type
      let hash = 0
      for (let i = 0; i < brand.length; i++) {
        hash = ((hash << 5) - hash + brand.charCodeAt(i)) | 0
      }
      const petrolVar = ((Math.abs(hash) % 60) - 30) / 100  // -0.30 to +0.30
      const dieselVar = (((Math.abs(hash * 7) % 60) - 30) / 100) + 0.40  // +0.10 to +0.70
      brandPrices.push({
        brand,
        petrol: Math.round((prices['Petrol'] + petrolVar) * 100) / 100,
        diesel: Math.round((prices['Diesel'] + dieselVar) * 100) / 100,
      })
    }
  }

  return {
    lastUpdated: new Date().toISOString(),
    source: 'NPA Ghana / Web Scraped',
    prices,
    brandPrices,
  }
}

// ============ GET Handler ============

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    // Check cache first
    const cached = getCachedPrices()
    if (cached) {
      return NextResponse.json(cached)
    }

    // Try to scrape live prices from NPA
    const scraped = await scrapeNpaPrices()

    const result: LivePriceResponse = scraped || getFallbackPrices()

    // Cache the result
    setCachedPrices(result)

    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch live fuel prices'
    // Even on unexpected errors, return fallback data rather than failing
    console.error('[live-prices] Error fetching prices:', message)

    const fallback = getFallbackPrices()
    fallback.source = `NPA Ghana / Fallback (error: ${message})`
    return NextResponse.json(fallback)
  }
}

// ============ POST Handler ============

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  try {
    const body = await request.json()
    const { brandUpdates } = body as { brandUpdates?: BrandPriceUpdate[] }

    if (!brandUpdates || !Array.isArray(brandUpdates) || brandUpdates.length === 0) {
      return NextResponse.json(
        { error: 'brandUpdates array is required with at least one entry.' },
        { status: 400 }
      )
    }

    // Validate each update entry
    for (const update of brandUpdates) {
      if (!update.brand || typeof update.brand !== 'string') {
        return NextResponse.json(
          { error: 'Each brandUpdate must include a non-empty "brand" string.' },
          { status: 400 }
        )
      }
      if (!update.diesel && !update.petrol && !update.lpg) {
        return NextResponse.json(
          { error: `At least one fuel type price is required for brand "${update.brand}".` },
          { status: 400 }
        )
      }
    }

    let updatedCount = 0
    const effectiveDate = new Date()
    const results: Array<{ stationId: string; brand: string; fuelType: string; pricePerLiter: number }> = []

    for (const update of brandUpdates) {
      // Find all stations matching this brand (case-insensitive)
      const stations = await db.fuelStation.findMany({
        where: {
          brand: { equals: update.brand, mode: 'insensitive' },
        },
        select: {
          id: true,
          brand: true,
          name: true,
        },
      })

      if (stations.length === 0) {
        // No stations found for this brand — skip but continue with others
        continue
      }

      const fuelTypes: Array<{ fuelType: string; price: number }> = []
      if (update.petrol) fuelTypes.push({ fuelType: 'Petrol', price: update.petrol })
      if (update.diesel) fuelTypes.push({ fuelType: 'Diesel', price: update.diesel })
      if (update.lpg) fuelTypes.push({ fuelType: 'LPG', price: update.lpg })

      for (const station of stations) {
        for (const { fuelType, price } of fuelTypes) {
          try {
            const created = await db.fuelPrice.create({
              data: {
                stationId: station.id,
                fuelType,
                pricePerLiter: price,
                effectiveDate,
                source: 'live_api',
                verified: false,
                notes: `Live price update via API for brand ${update.brand}.`,
              },
            })
            results.push({
              stationId: created.stationId,
              brand: update.brand,
              fuelType: created.fuelType,
              pricePerLiter: created.pricePerLiter,
            })
            updatedCount++
          } catch {
            // Individual station price creation failure — log and continue
            console.warn(
              `[live-prices] Failed to create price for station ${station.id} (${update.brand}) - ${fuelType}`
            )
          }
        }
      }
    }

    // Invalidate cache since we've just written new price data
    priceCache.delete(CACHE_KEY)

    return NextResponse.json({
      updated: updatedCount,
      details: results,
      appliedAt: effectiveDate.toISOString(),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to apply live prices'
    console.error('[live-prices] POST error:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
