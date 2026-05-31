// ════════════════════════════════════════════════════════════════════
// iFleetPro — AI Service (Socket.IO + HTTP API)
// ════════════════════════════════════════════════════════════════════
//
// AI-powered fleet management assistant on port 3007.
// Uses Groq (free, fast) via groq-sdk (OpenAI-compatible API).
//
// HTTP API (backend → service):
//   - POST /api/chat              → chat completions with conversation history
//   - POST /api/dispatch-suggest  → optimal driver/truck recommendations
//   - POST /api/fuel-anomaly      → fuel log anomaly analysis
//   - POST /api/report-nl         → natural language report generation
//   - POST /api/analyze-document  → receipt/document intelligence (Vision)
//   - POST /api/maintenance-predict → predictive maintenance alerts
//   - POST /api/invoice-dispute   → invoice dispute resolution
//
// Health check:
//   - GET /api/health             → { status: 'ok' }
// ────────────────────────────────────────────────────────────────────

import { Server } from 'socket.io'
import http from 'http'
import Groq from 'groq-sdk'

const PORT = 3007

// API key for authenticating backend requests
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'ifleetpro-internal-key-change-me'

// Groq API key
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''

// Default model — mixtral is fast and free on Groq
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

// ── System prompts ──
const FLEET_ASSISTANT_PROMPT = `You are an AI assistant for iFleet Pro fleet management system. Help drivers and managers with questions about trips, fuel, maintenance, routes, and general fleet operations. Be concise and helpful. Use bullet points when listing items. Format currency amounts in GHS (Ghana Cedi). When discussing trips, consider factors like distance, fuel consumption, driver availability, and truck maintenance status.`

const DISPATCH_PROMPT = `You are a fleet dispatch optimization expert for iFleet Pro. Analyze trip details and recommend the best driver and truck assignments based on factors like: driver availability and proximity, truck suitability (capacity, fuel type, maintenance status), historical performance, route familiarity, and regulatory compliance (license, certifications). Respond with a JSON object containing: { "recommendations": [{ "driverId": "...", "driverName": "...", "truckId": "...", "truckPlate": "...", "score": 0-100, "reason": "..." }], "summary": "..." }`

const FUEL_ANOMALY_PROMPT = `You are a fuel analytics expert for iFleet Pro. Analyze fuel log data to identify anomalies such as: unusual fuel consumption patterns, potential fuel theft indicators, inconsistent odometer readings, abnormal fill-up frequencies, mileage-per-gallon deviations. Respond with a JSON object containing: { "anomalies": [{ "type": "...", "severity": "low|medium|high|critical", "description": "...", "affectedRecord": "..." }], "summary": "...", "recommendations": ["..."] }`

const REPORT_PROMPT = `You are a fleet data analyst for iFleet Pro. Generate a clear, well-structured natural language report from the provided data. Include key metrics, trends, and actionable insights. Use professional language suitable for management review. Format numbers with appropriate precision. Use GHS for currency amounts.`

const DOCUMENT_ANALYSIS_PROMPT = `You are a document analysis AI for a fleet management company. Extract structured data from receipts, invoices, and delivery documents. You must return ONLY valid JSON (no markdown, no code fences, no extra text) with the following fields:
- "type": one of "fuel_receipt", "expense_receipt", "delivery_note", "invoice"
- "vendor": the vendor/supplier name (string)
- "date": the document date in YYYY-MM-DD format (string)
- "totalAmount": the total amount as a number (no currency symbol)
- "currency": the currency code e.g. "GHS" (string, default "GHS")
- "items": array of { "description": string, "quantity": number, "unitPrice": number } — if applicable
- "fuelLiters": number of liters if this is a fuel receipt (number or null)
- "fuelType": type of fuel if applicable (string or null)
- "notes": any additional notes or observations (string)

Be precise with numbers. If a field cannot be determined, use null. Return ONLY the JSON object, no other text.`

const MAINTENANCE_PREDICT_PROMPT = `You are a fleet maintenance AI for iFleet Pro. Based on truck data and maintenance history, predict when the next maintenance is needed, likely issues, and urgency. You must return ONLY valid JSON (no markdown, no code fences, no extra text) with the following fields:
- "predictedNextMaintenance": predicted date for next maintenance in YYYY-MM-DD format (string)
- "daysUntilMaintenance": estimated days until maintenance is needed (number)
- "predictedIssues": array of { "issue": string, "severity": "low"|"medium"|"high"|"critical", "description": string }
- "urgency": one of "low", "medium", "high", "critical" (string)
- "recommendedActions": array of action strings
- "confidence": confidence score 0-100 (number)
- "summary": brief summary of prediction (string)

Consider mileage patterns, maintenance intervals, issue recurrence, and component wear. Return ONLY the JSON object, no other text.`

const INVOICE_DISPUTE_PROMPT = `You are a billing dispute resolution AI for iFleet Pro. Analyze the invoice data and dispute reason to recommend a fair resolution. You must return ONLY valid JSON (no markdown, no code fences, no extra text) with the following fields:
- "analysis": analysis of the dispute and supporting evidence (string)
- "resolution": recommended resolution description (string)
- "creditAmount": recommended credit/adjustment amount as a number (or 0 if no credit)
- "currency": currency code (default "GHS")
- "validity": one of "valid", "partially_valid", "invalid" (string)
- "recommendation": one of "full_credit", "partial_credit", "no_credit", "escalate" (string)
- "reasoning": detailed reasoning for the recommendation (string)

Be fair and objective. Consider both the customer and business perspectives. Return ONLY the JSON object, no other text.`

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

// ── Groq SDK ──
let groq: Groq | null = null
let initialized = false

function initGroq() {
  if (!GROQ_API_KEY) {
    console.error('[AI Service] GROQ_API_KEY not set. AI features will return errors.')
    console.error('[AI Service] Set it in .env or as environment variable.')
    return
  }
  groq = new Groq({ apiKey: GROQ_API_KEY })
  initialized = true
  console.log('[AI Service] Groq SDK initialized')
}

/**
 * Call Groq with a text prompt. Returns the raw text response.
 */
async function callGroq(systemPrompt: string, userMessage: string): Promise<string> {
  if (!groq) throw new Error('Groq not initialized. Set GROQ_API_KEY.')

  const response = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 2048,
  })

  return response.choices[0]?.message?.content || ''
}

/**
 * Call Groq with image (vision) + text prompt. Returns raw text.
 */
async function callGroqVision(prompt: string, imageBase64: string, mimeType: string): Promise<string> {
  if (!groq) throw new Error('Groq not initialized. Set GROQ_API_KEY.')

  const response = await groq.chat.completions.create({
    model: 'llama-3.2-90b-vision-preview',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
    temperature: 0.3,
    max_tokens: 2048,
  })

  return response.choices[0]?.message?.content || ''
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

      // Build messages array for Groq conversation
      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: FLEET_ASSISTANT_PROMPT },
      ]
      if (data.conversationHistory && data.conversationHistory.length > 0) {
        const recent = data.conversationHistory.slice(-20)
        messages.push(...recent)
      }
      messages.push({ role: 'user', content: data.message })

      const response = await callGroqMulti(messages)

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

/**
 * Call Groq with a full messages array (for multi-turn conversation).
 */
async function callGroqMulti(messages: Array<{ role: string; content: string }>): Promise<string> {
  if (!groq) throw new Error('Groq not initialized. Set GROQ_API_KEY.')

  const response = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    temperature: 0.7,
    max_tokens: 2048,
  })

  return response.choices[0]?.message?.content || ''
}

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
    res.end(JSON.stringify({
      status: 'ok',
      connectedUsers: userSockets.size,
      service: 'ai',
      provider: initialized ? 'groq' : 'not_configured',
      model: initialized ? GROQ_MODEL : undefined,
    }))
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

  // ── Document analysis (Vision) ──
  if (url.pathname === '/api/analyze-document' && req.method === 'POST') {
    await handleAnalyzeDocument(req, res)
    return
  }

  // ── Maintenance prediction ──
  if (url.pathname === '/api/maintenance-predict' && req.method === 'POST') {
    await handleMaintenancePredict(req, res)
    return
  }

  // ── Invoice dispute resolution ──
  if (url.pathname === '/api/invoice-dispute' && req.method === 'POST') {
    await handleInvoiceDispute(req, res)
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

/** Clean markdown code fences from model output, then parse JSON */
function parseJsonResponse(raw: string): Record<string, unknown> {
  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return { raw, error: 'Could not parse structured data from response.' }
  }
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
    const { userId, message, conversationHistory, fleetContext } = body

    if (!userId || !message) {
      return jsonResponse(res, 400, { error: 'userId and message are required' })
    }

    console.log(`[AI Service] /api/chat request from ${userId}: ${message.substring(0, 100)}`)

    // Build system prompt with fleet context if provided
    let systemPrompt = FLEET_ASSISTANT_PROMPT
    if (fleetContext) {
      systemPrompt += '\n\n' + fleetContext
    }

    // Build messages array for multi-turn conversation
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ]
    if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      const recent = conversationHistory.slice(-20)
      messages.push(...recent)
    }
    messages.push({ role: 'user', content: message })

    const aiResponse = await callGroqMulti(messages)
    console.log(`[AI Service] Groq response received (${aiResponse.length} chars)`)

    jsonResponse(res, 200, { success: true, response: aiResponse, userId })
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

    const dataDescription = JSON.stringify({ tripDetails, availableDrivers: availableDrivers || [], availableTrucks: availableTrucks || [] }, null, 2)
    const aiResponse = await callGroq(DISPATCH_PROMPT, `Analyze this trip and recommend optimal driver/truck assignments:\n\n${dataDescription}`)

    jsonResponse(res, 200, { success: true, response: aiResponse })
  } catch (error) {
    console.error('[AI Service] /api/dispatch-suggest error:', error)
    jsonResponse(res, 500, { success: false, error: error instanceof Error ? error.message : 'Internal server error' })
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

    const dataDescription = JSON.stringify({ fuelLogs, vehicleInfo: vehicleInfo || null, logCount: fuelLogs.length }, null, 2)
    const aiResponse = await callGroq(FUEL_ANOMALY_PROMPT, `Analyze these fuel logs for anomalies:\n\n${dataDescription}`)

    jsonResponse(res, 200, { success: true, response: aiResponse })
  } catch (error) {
    console.error('[AI Service] /api/fuel-anomaly error:', error)
    jsonResponse(res, 500, { success: false, error: error instanceof Error ? error.message : 'Internal server error' })
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

    const dataDescription = JSON.stringify({ reportType, data, additionalContext: additionalContext || '' }, null, 2)
    const aiResponse = await callGroq(REPORT_PROMPT, `Generate a ${reportType} report from this data:\n\n${dataDescription}`)

    jsonResponse(res, 200, { success: true, response: aiResponse, reportType })
  } catch (error) {
    console.error('[AI Service] /api/report-nl error:', error)
    jsonResponse(res, 500, { success: false, error: error instanceof Error ? error.message : 'Internal server error' })
  }
}

async function handleAnalyzeDocument(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    if (!verifyApiKey(req)) {
      return jsonResponse(res, 401, { error: 'Unauthorized: Invalid or missing API key' })
    }

    const body = JSON.parse(await readBody(req))
    const { image, fileName, userId } = body

    if (!image || typeof image !== 'string') {
      return jsonResponse(res, 400, { error: 'image (base64 data URL) is required' })
    }

    console.log(`[AI Service] /api/analyze-document request from ${userId || 'unknown'}, file: ${fileName || 'unknown'}`)

    // Parse base64 data URL: "data:<mimeType>;base64,<data>"
    const matches = image.match(/^data:(image\/\w+);base64,(.+)$/)
    if (!matches) {
      return jsonResponse(res, 400, { error: 'image must be a valid base64 data URL' })
    }

    const mimeType = matches[1]
    const base64Data = matches[2]

    console.log(`[AI Service] Sending image to Groq Vision for document analysis (${base64Data.length} chars base64)...`)

    const rawContent = await callGroqVision(DOCUMENT_ANALYSIS_PROMPT, base64Data, mimeType)
    console.log(`[AI Service] Groq Vision response received (${rawContent.length} chars)`)

    const parsed = parseJsonResponse(rawContent)

    jsonResponse(res, 200, { success: true, data: parsed, userId: userId || null })
  } catch (error) {
    console.error('[AI Service] /api/analyze-document error:', error)
    jsonResponse(res, 500, { success: false, error: error instanceof Error ? error.message : 'Internal server error' })
  }
}

async function handleMaintenancePredict(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    if (!verifyApiKey(req)) {
      return jsonResponse(res, 401, { error: 'Unauthorized: Invalid or missing API key' })
    }

    const body = JSON.parse(await readBody(req))
    const { truckId, mileage, lastMaintenanceDate, maintenanceHistory, userId } = body

    if (!truckId) {
      return jsonResponse(res, 400, { error: 'truckId is required' })
    }

    console.log(`[AI Service] /api/maintenance-predict request for truck ${truckId}`)

    const dataDescription = JSON.stringify({ truckId, mileage, lastMaintenanceDate, maintenanceHistory: maintenanceHistory || [], analysisDate: new Date().toISOString() }, null, 2)
    const rawContent = await callGroq(MAINTENANCE_PREDICT_PROMPT, `Predict maintenance needs for this truck:\n\n${dataDescription}`)
    console.log(`[AI Service] Maintenance predict response received (${rawContent.length} chars)`)

    const parsed = parseJsonResponse(rawContent)

    jsonResponse(res, 200, { success: true, data: parsed, truckId, userId: userId || null })
  } catch (error) {
    console.error('[AI Service] /api/maintenance-predict error:', error)
    jsonResponse(res, 500, { success: false, error: error instanceof Error ? error.message : 'Internal server error' })
  }
}

async function handleInvoiceDispute(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    if (!verifyApiKey(req)) {
      return jsonResponse(res, 401, { error: 'Unauthorized: Invalid or missing API key' })
    }

    const body = JSON.parse(await readBody(req))
    const { invoiceId, disputeReason, invoiceData, userId } = body

    if (!invoiceId || !disputeReason) {
      return jsonResponse(res, 400, { error: 'invoiceId and disputeReason are required' })
    }

    console.log(`[AI Service] /api/invoice-dispute request for invoice ${invoiceId}`)

    const dataDescription = JSON.stringify({ invoiceId, disputeReason, invoiceData: invoiceData || {}, analysisDate: new Date().toISOString() }, null, 2)
    const rawContent = await callGroq(INVOICE_DISPUTE_PROMPT, `Analyze this invoice dispute:\n\n${dataDescription}`)
    console.log(`[AI Service] Invoice dispute response received (${rawContent.length} chars)`)

    const parsed = parseJsonResponse(rawContent)

    jsonResponse(res, 200, { success: true, data: parsed, invoiceId, userId: userId || null })
  } catch (error) {
    console.error('[AI Service] /api/invoice-dispute error:', error)
    jsonResponse(res, 500, { success: false, error: error instanceof Error ? error.message : 'Internal server error' })
  }
}

// ════════════════════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════════════════════

function main() {
  initGroq()

  httpServer.listen(PORT, () => {
    console.log(`[AI Service] Running on port ${PORT}`)
    console.log(`[AI Service] Provider: ${initialized ? `Groq (${GROQ_MODEL})` : 'NOT CONFIGURED — set GROQ_API_KEY'}`)
    console.log(`[AI Service] Chat:              http://localhost:${PORT}/api/chat`)
    console.log(`[AI Service] Dispatch Suggest:  http://localhost:${PORT}/api/dispatch-suggest`)
    console.log(`[AI Service] Fuel Anomaly:      http://localhost:${PORT}/api/fuel-anomaly`)
    console.log(`[AI Service] Report NL:         http://localhost:${PORT}/api/report-nl`)
    console.log(`[AI Service] Analyze Doc:       http://localhost:${PORT}/api/analyze-document`)
    console.log(`[AI Service] Maint Predict:     http://localhost:${PORT}/api/maintenance-predict`)
    console.log(`[AI Service] Invoice Dispute:   http://localhost:${PORT}/api/invoice-dispute`)
    console.log(`[AI Service] Health:            http://localhost:${PORT}/api/health`)
  })
}

main()
