// ════════════════════════════════════════════════════════════════════
// iFleetPro — AI Service (Socket.IO + HTTP API)
// ════════════════════════════════════════════════════════════════════
//
// AI-powered fleet management assistant on port 3007.
//
// Socket.IO events (client ↔ service):
//   - client emits  'ai:chat'         → send message, receive AI response
//   - client emits  'ai:subscribe'    → subscribe to AI responses (alias)
//   - service emits 'ai:response'    → push AI response back
//
// HTTP API (backend → service):
//   - POST /api/chat            → chat completions with conversation history
//   - POST /api/dispatch-suggest → optimal driver/truck recommendations
//   - POST /api/fuel-anomaly    → fuel log anomaly analysis
//   - POST /api/report-nl       → natural language report generation
//
// Health check:
//   - GET /api/health           → { status: 'ok' }
// ────────────────────────────────────────────────────────────────────

import { Server } from 'socket.io'
import http from 'http'
import ZAI from 'z-ai-web-dev-sdk'

const PORT = 3007

// API key for authenticating backend requests
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'ifleetpro-internal-key-change-me'

// ── System prompts ──
const FLEET_ASSISTANT_PROMPT = `You are an AI assistant for iFleet Pro fleet management system. Help drivers and managers with questions about trips, fuel, maintenance, routes, and general fleet operations. Be concise and helpful. Use bullet points when listing items. Format currency amounts in GHS (Ghana Cedi). When discussing trips, consider factors like distance, fuel consumption, driver availability, and truck maintenance status.`

const DISPATCH_PROMPT = `You are a fleet dispatch optimization expert for iFleet Pro. Analyze trip details and recommend the best driver and truck assignments based on factors like: driver availability and proximity, truck suitability (capacity, fuel type, maintenance status), historical performance, route familiarity, and regulatory compliance (license, certifications). Respond with a JSON object containing: { "recommendations": [{ "driverId": "...", "driverName": "...", "truckId": "...", "truckPlate": "...", "score": 0-100, "reason": "..." }], "summary": "..." }`

const FUEL_ANOMALY_PROMPT = `You are a fuel analytics expert for iFleet Pro. Analyze fuel log data to identify anomalies such as: unusual fuel consumption patterns, potential fuel theft indicators, inconsistent odometer readings, abnormal fill-up frequencies, mileage-per-gallon deviations. Respond with a JSON object containing: { "anomalies": [{ "type": "...", "severity": "low|medium|high|critical", "description": "...", "affectedRecord": "..." }], "summary": "...", "recommendations": ["..."] }`

const REPORT_PROMPT = `You are a fleet data analyst for iFleet Pro. Generate a clear, well-structured natural language report from the provided data. Include key metrics, trends, and actionable insights. Use professional language suitable for management review. Format numbers with appropriate precision. Use GHS for currency amounts.`

// ── Create HTTP server + Socket.IO ──
const httpServer = http.createServer()

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'https://ifleetpro.lightworldtech.com'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['polling', 'websocket'],
})

// ── In-memory stores ──
const userSockets = new Map<string, Set<string>>()
const socketUserMap = new Map<string, string>()

// ── ZAI SDK instance (lazy-initialized) ──
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

// ════════════════════════════════════════════════════════════════════
// SOCKET.IO EVENT HANDLERS
// ════════════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
  console.log(`[AI Service] Client connected: ${socket.id}`)

  socket.on('ai:subscribe', (data: { userId: string }, ack?: (data: unknown) => void) => {
    subscribeUser(socket.id, data.userId)
    if (ack) ack({ status: 'ok' })
  })

  socket.on('ai:chat', async (data: { userId: string; message: string; conversationHistory?: Array<{ role: string; content: string }> }, ack?: (data: unknown) => void) => {
    try {
      subscribeUser(socket.id, data.userId)

      const messages: Array<{ role: string; content: string }> = [
        { role: 'assistant', content: FLEET_ASSISTANT_PROMPT },
      ]

      // Add conversation history if provided
      if (data.conversationHistory && data.conversationHistory.length > 0) {
        messages.push(...data.conversationHistory)
      }

      // Add the current user message
      messages.push({ role: 'user', content: data.message })

      const zai = await getZAI()
      const completion = await zai.chat.completions.create({
        messages,
        thinking: { type: 'disabled' },
      })

      const response = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.'

      socket.emit('ai:response', {
        userId: data.userId,
        response,
        timestamp: new Date().toISOString(),
      })

      if (ack) ack({ success: true, response })
    } catch (error) {
      console.error('[AI Service] Socket chat error:', error)
      const errorMsg = error instanceof Error ? error.message : 'Internal server error'
      socket.emit('ai:response', {
        userId: data.userId,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      })
      if (ack) ack({ success: false, error: errorMsg })
    }
  })

  socket.on('disconnect', () => {
    console.log(`[AI Service] Client disconnected: ${socket.id}`)
    cleanupSocket(socket.id)
  })
})

function subscribeUser(socketId: string, userId: string) {
  const sockets = userSockets.get(userId) || new Set()
  sockets.add(socketId)
  userSockets.set(userId, sockets)
  socketUserMap.set(socketId, userId)
}

function cleanupSocket(socketId: string) {
  const userId = socketUserMap.get(socketId)
  if (userId) {
    const sockets = userSockets.get(userId)
    if (sockets) {
      sockets.delete(socketId)
      if (sockets.size === 0) userSockets.delete(userId)
    }
    socketUserMap.delete(socketId)
  }
}

// ════════════════════════════════════════════════════════════════════
// HTTP API
// ════════════════════════════════════════════════════════════════════

httpServer.on('request', async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': 'http://localhost:3000',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-internal-api-key',
      'Access-Control-Max-Age': '86400',
    })
    res.end()
    return
  }

  // ── Health check ──
  if (url.pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', connectedUsers: userSockets.size, service: 'ai' }))
    return
  }

  // ── Chat endpoint ──
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    await handleChat(req, res)
    return
  }

  // ── Dispatch suggestions ──
  if (url.pathname === '/api/dispatch-suggest' && req.method === 'POST') {
    await handleDispatchSuggest(req, res)
    return
  }

  // ── Fuel anomaly ──
  if (url.pathname === '/api/fuel-anomaly' && req.method === 'POST') {
    await handleFuelAnomaly(req, res)
    return
  }

  // ── Natural language report ──
  if (url.pathname === '/api/report-nl' && req.method === 'POST') {
    await handleReportNL(req, res)
    return
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

// ── Helpers ──

function verifyApiKey(req: http.IncomingMessage): boolean {
  const apiKey = req.headers['x-internal-api-key']
  return apiKey === INTERNAL_API_KEY
}

function setCorsHeaders(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000')
  res.setHeader('Content-Type', 'application/json')
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

function jsonResponse(res: http.ServerResponse, status: number, data: unknown) {
  setCorsHeaders(res)
  res.writeHead(status)
  res.end(JSON.stringify(data))
}

// ════════════════════════════════════════════════════════════════════
// HANDLERS
// ════════════════════════════════════════════════════════════════════

async function handleChat(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    if (!verifyApiKey(req)) {
      return jsonResponse(res, 401, { error: 'Unauthorized: Invalid or missing API key' })
    }

    const body = JSON.parse(await readBody(req))
    const { userId, message, conversationHistory } = body

    if (!userId || !message) {
      return jsonResponse(res, 400, { error: 'userId and message are required' })
    }

    console.log(`[AI Service] /api/chat request from ${userId}: ${message.substring(0, 100)}`)

    const messages: Array<{ role: string; content: string }> = [
      { role: 'assistant', content: FLEET_ASSISTANT_PROMPT },
    ]

    if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      // Limit history to last 20 messages to avoid token limits
      const recentHistory = conversationHistory.slice(-20)
      messages.push(...recentHistory)
    }

    messages.push({ role: 'user', content: message })

    const zai = await getZAI()
    console.log(`[AI Service] Sending ${messages.length} messages to ZAI SDK...`)
    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    })

    const aiResponse = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.'
    console.log(`[AI Service] ZAI response received (${aiResponse.length} chars)`)

    jsonResponse(res, 200, {
      success: true,
      response: aiResponse,
      userId,
    })
  } catch (error) {
    console.error('[AI Service] /api/chat error:', error)
    jsonResponse(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    })
  }
}

async function handleDispatchSuggest(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    if (!verifyApiKey(req)) {
      return jsonResponse(res, 401, { error: 'Unauthorized: Invalid or missing API key' })
    }

    const body = JSON.parse(await readBody(req))
    const { tripDetails, availableDrivers, availableTrucks } = body

    if (!tripDetails) {
      return jsonResponse(res, 400, { error: 'tripDetails is required' })
    }

    const dataDescription = JSON.stringify(
      {
        tripDetails,
        availableDrivers: availableDrivers || [],
        availableTrucks: availableTrucks || [],
      },
      null,
      2
    )

    const zai = await getZAI()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: DISPATCH_PROMPT },
        {
          role: 'user',
          content: `Analyze this trip and recommend optimal driver/truck assignments:\n\n${dataDescription}`,
        },
      ],
      thinking: { type: 'disabled' },
    })

    const aiResponse = completion.choices[0]?.message?.content || 'No recommendations generated.'

    jsonResponse(res, 200, {
      success: true,
      response: aiResponse,
    })
  } catch (error) {
    console.error('[AI Service] /api/dispatch-suggest error:', error)
    jsonResponse(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    })
  }
}

async function handleFuelAnomaly(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    if (!verifyApiKey(req)) {
      return jsonResponse(res, 401, { error: 'Unauthorized: Invalid or missing API key' })
    }

    const body = JSON.parse(await readBody(req))
    const { fuelLogs, vehicleInfo } = body

    if (!fuelLogs || !Array.isArray(fuelLogs) || fuelLogs.length === 0) {
      return jsonResponse(res, 400, { error: 'fuelLogs array is required and must not be empty' })
    }

    const dataDescription = JSON.stringify(
      {
        fuelLogs,
        vehicleInfo: vehicleInfo || null,
        logCount: fuelLogs.length,
      },
      null,
      2
    )

    const zai = await getZAI()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: FUEL_ANOMALY_PROMPT },
        {
          role: 'user',
          content: `Analyze these fuel logs for anomalies:\n\n${dataDescription}`,
        },
      ],
      thinking: { type: 'disabled' },
    })

    const aiResponse = completion.choices[0]?.message?.content || 'No analysis generated.'

    jsonResponse(res, 200, {
      success: true,
      response: aiResponse,
    })
  } catch (error) {
    console.error('[AI Service] /api/fuel-anomaly error:', error)
    jsonResponse(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    })
  }
}

async function handleReportNL(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    if (!verifyApiKey(req)) {
      return jsonResponse(res, 401, { error: 'Unauthorized: Invalid or missing API key' })
    }

    const body = JSON.parse(await readBody(req))
    const { reportType, data, additionalContext } = body

    if (!reportType || !data) {
      return jsonResponse(res, 400, { error: 'reportType and data are required' })
    }

    const dataDescription = JSON.stringify(
      {
        reportType,
        data,
        additionalContext: additionalContext || '',
      },
      null,
      2
    )

    const zai = await getZAI()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: REPORT_PROMPT },
        {
          role: 'user',
          content: `Generate a ${reportType} report from this data:\n\n${dataDescription}`,
        },
      ],
      thinking: { type: 'disabled' },
    })

    const aiResponse = completion.choices[0]?.message?.content || 'No report generated.'

    jsonResponse(res, 200, {
      success: true,
      response: aiResponse,
      reportType,
    })
  } catch (error) {
    console.error('[AI Service] /api/report-nl error:', error)
    jsonResponse(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    })
  }
}

// ════════════════════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════════════════════

async function main() {
  // Pre-initialize ZAI SDK
  try {
    console.log('[AI Service] Initializing ZAI SDK...')
    zaiInstance = await getZAI()
    console.log('[AI Service] ZAI SDK ready')
  } catch (error) {
    console.error('[AI Service] Failed to initialize ZAI SDK:', error)
    console.error('[AI Service] Will retry on first request')
  }

  httpServer.listen(PORT, () => {
    console.log(`[AI Service] Running on port ${PORT}`)
    console.log(`[AI Service] Chat:            http://localhost:${PORT}/api/chat`)
    console.log(`[AI Service] Dispatch Suggest: http://localhost:${PORT}/api/dispatch-suggest`)
    console.log(`[AI Service] Fuel Anomaly:    http://localhost:${PORT}/api/fuel-anomaly`)
    console.log(`[AI Service] Report NL:       http://localhost:${PORT}/api/report-nl`)
    console.log(`[AI Service] Health:          http://localhost:${PORT}/api/health`)
  })
}

main()
