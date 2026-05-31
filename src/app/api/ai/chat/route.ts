import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'

const AI_SERVICE_URL = 'http://localhost:3007'
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'ifleetpro-internal-key-change-me'
/** Server-side timeout for the AI service call (90 seconds) */
const AI_TIMEOUT_MS = 90_000

/**
 * Build a fleet context string by querying real data from the database.
 * This is injected into the system prompt so the AI can answer data-driven questions.
 */
async function buildFleetContext(auth: { userId: string; driverId: string | null; roleName: string }): Promise<string> {
  try {
    const now = new Date()

    // ── Drivers summary ──
    const drivers = await db.driver.findMany({
      where: { status: 'active' },
      select: {
        id: true, firstName: true, lastName: true, phone: true,
        status: true, totalTrips: true, rating: true,
        licenseExpiry: true,
        truck: { select: { id: true, plateNumber: true, make: true, model: true, status: true } },
      },
      take: 50,
    })

    const activeDrivers = drivers.length
    const inactiveDrivers = await db.driver.count({ where: { status: { not: 'active' } } })

    // ── Trucks summary ──
    const trucks = await db.truck.findMany({
      select: {
        id: true, plateNumber: true, make: true, model: true, year: true,
        status: true, fuelType: true, currentMileage: true,
        nextServiceDate: true, tankCapacity: true,
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
      take: 50,
    })

    const activeTrucks = trucks.filter(t => t.status === 'active').length
    const maintenanceDue = trucks.filter(t => t.nextServiceDate && t.nextServiceDate <= new Date(now.getTime() + 7 * 86400000)).length

    // ── Recent trips (last 10 completed + 10 active) ──
    const recentTrips = await db.trip.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - 30 * 86400000) } },
      select: {
        id: true, tripNumber: true, status: true,
        loadingLocation: true, destination: true,
        itemName: true, quantity: true, unit: true,
        totalRevenue: true, fuelCost: true, totalMileage: true,
        departureTime: true, arrivalTime: true,
        driver: { select: { firstName: true, lastName: true } },
        truck: { select: { plateNumber: true } },
      },
      orderBy: { departureTime: 'desc' },
      take: 20,
    })

    const tripStats = await db.trip.groupBy({
      by: ['status'],
      _count: true,
    })

    // ── Today's summary ──
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayTrips = await db.trip.count({
      where: { departureTime: { gte: startOfDay } },
    })
    const todayActive = await db.trip.count({
      where: { status: { in: ['in_transit', 'loading', 'offloading'] }, departureTime: { gte: startOfDay } },
    })

    // ── Build context string ──
    const lines: string[] = []
    lines.push('=== FLEET DATA CONTEXT (read-only, do not request API access) ===')
    lines.push(`Date: ${now.toISOString().split('T')[0]}`)
    lines.push('')

    // Drivers
    lines.push(`--- DRIVERS (${activeDrivers} active, ${inactiveDrivers} inactive) ---`)
    for (const d of drivers.slice(0, 30)) {
      const truck = d.truck ? ` [${d.truck.plateNumber}]` : ''
      const licenseWarning = d.licenseExpiry && d.licenseExpiry <= new Date(now.getTime() + 30 * 86400000) ? ' ⚠ LICENSE EXPIRING' : ''
      lines.push(`  • ${d.firstName} ${d.lastName} — ${d.phone} — ${d.status}${truck} — ${d.totalTrips} trips — Rating: ${d.rating}${licenseWarning}`)
    }
    lines.push('')

    // Trucks
    lines.push(`--- TRUCKS (${activeTrucks} active, ${maintenanceDue} need service soon) ---`)
    for (const t of trucks.slice(0, 30)) {
      const driver = t.driver ? ` (${t.driver.firstName} ${t.driver.lastName})` : ' (no driver)'
      const serviceWarning = t.nextServiceDate && t.nextServiceDate <= new Date(now.getTime() + 7 * 86400000) ? ' ⚠ SERVICE DUE' : ''
      lines.push(`  • ${t.plateNumber} — ${t.make} ${t.model} ${t.year} — ${t.fuelType} — ${t.status}${driver} — ${Math.round(t.currentMileage)}km${serviceWarning}`)
    }
    lines.push('')

    // Trip stats
    lines.push('--- TRIP STATUS SUMMARY ---')
    for (const ts of tripStats) {
      lines.push(`  • ${ts.status}: ${ts._count}`)
    }
    lines.push(`  • Today: ${todayTrips} trips (${todayActive} active)`)
    lines.push('')

    // Recent trips
    lines.push('--- RECENT TRIPS (last 30 days) ---')
    for (const t of recentTrips.slice(0, 20)) {
      const driver = t.driver ? `${t.driver.firstName} ${t.driver.lastName}` : 'Unknown'
      const revenue = t.totalRevenue ? ` GHS ${t.totalRevenue}` : ''
      const fuel = t.fuelCost ? ` Fuel: GHS ${t.fuelCost}` : ''
      lines.push(`  • [${t.tripNumber}] ${t.status} — ${driver} — ${t.truck.plateNumber} — ${t.loadingLocation} → ${t.destination} — ${t.itemName} (${t.quantity}${t.unit})${revenue}${fuel}`)
    }
    lines.push('')

    lines.push('=== END FLEET DATA ===')
    lines.push('')
    lines.push('IMPORTANT: You already have access to all this fleet data above. Answer questions directly using this data. Do NOT ask the user to provide data, export CSVs, or set up API connections. Just use the data already provided to give helpful answers.')
    lines.push('')

    return lines.join('\n')
  } catch (error) {
    console.error('[AI Chat] Error building fleet context:', error)
    return 'Error loading fleet context. Answer general fleet questions.'
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { message, conversationHistory } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message is required and must be a string' },
        { status: 400 }
      )
    }

    // Build fleet context in parallel with preparing the request
    const fleetContextPromise = buildFleetContext(auth)

    // Forward to AI service with server-side timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

    const fleetContext = await fleetContextPromise

    let response: Response
    try {
      response = await fetch(`${AI_SERVICE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-api-key': INTERNAL_API_KEY,
        },
        body: JSON.stringify({
          userId: auth.userId,
          message,
          conversationHistory: conversationHistory || [],
          fleetContext,
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'AI service error' },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.error('[AI Chat] Timed out after', AI_TIMEOUT_MS, 'ms')
      return NextResponse.json(
        { error: 'AI service took too long to respond. Please try again.' },
        { status: 504 }
      )
    }
    console.error('[AI Chat] Error:', error)
    return NextResponse.json(
      { error: 'Failed to communicate with AI service. Is it running on port 3007?' },
      { status: 500 }
    )
  }
}
