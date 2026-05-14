import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// POST /api/scan-receipt
// Accepts a base64-encoded image of a receipt/fuel slip,
// uses VLM (Vision Language Model) to extract structured data.

interface ReceiptData {
  type: 'fuel' | 'general_expense' | 'unknown'
  confidence: number
  // Common fields
  date?: string           // ISO date string YYYY-MM-DD
  totalAmount?: number
  merchant?: string       // Station/shop name
  reference?: string      // Receipt/invoice number
  // Fuel-specific fields
  liters?: number
  pricePerLiter?: number
  fuelType?: string       // Diesel / Petrol
  odometer?: number
  // General fields
  description?: string
  category?: string       // fuel, maintenance, tyre, toll, etc.
  paymentMethod?: string
  rawText?: string        // Full OCR text from the image
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { image } = body

    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { error: 'Image is required. Provide a base64-encoded image string.' },
        { status: 400 }
      )
    }

    // Validate base64 format
    if (!image.startsWith('data:image/') && !image.startsWith('/9j/') && !image.startsWith('iVBOR')) {
      return NextResponse.json(
        { error: 'Invalid image format. Must be a base64-encoded JPEG, PNG, or WebP image.' },
        { status: 400 }
      )
    }

    // Prepend data URL prefix if missing
    const imageUrl = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`

    // Initialize VLM SDK
    const zai = await ZAI.create()

    const prompt = `Analyze this receipt/fuel slip image and extract structured data.

Determine if this is a FUEL RECEIPT (from a filling station) or a GENERAL EXPENSE RECEIPT.

Extract the following information and return it as JSON ONLY (no markdown, no code fences):
{
  "type": "fuel" or "general_expense" or "unknown",
  "confidence": 0.0 to 1.0,
  "date": "YYYY-MM-DD" or null,
  "totalAmount": number or null,
  "merchant": "station or shop name" or null,
  "reference": "receipt/invoice number" or null,
  "liters": number or null,
  "pricePerLiter": number or null,
  "fuelType": "Diesel" or "Petrol" or null,
  "odometer": number or null,
  "description": "brief description of the expense" or null,
  "category": one of ["fuel", "maintenance", "tyre", "insurance", "toll", "fine", "permit", "washing", "miscellaneous"] or null,
  "paymentMethod": "cash" or "mobile_money" or "bank_transfer" or null,
  "rawText": "all readable text from the receipt"
}

Rules:
- For fuel receipts, always extract liters, pricePerLiter, and fuelType if visible
- Convert amounts to numbers (remove currency symbols)
- Date format must be YYYY-MM-DD
- For fuel receipts, category should be "fuel"
- If merchant looks like a Ghana filling station (Shell, Goil, Total, Engen, Zen, etc.), set type to "fuel"
- Odometer reading if present on a fuel slip
- If unsure about any field, set it to null
- Return ONLY the JSON object, nothing else`

    const response = await zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    })

    const content = response.choices[0]?.message?.content

    if (!content) {
      return NextResponse.json(
        { error: 'Failed to extract data from the receipt image.' },
        { status: 500 }
      )
    }

    // Parse the JSON response from VLM
    let receiptData: ReceiptData

    try {
      // Strip markdown code fences if present
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      receiptData = JSON.parse(cleaned)
    } catch {
      // If JSON parsing fails, return raw text
      receiptData = {
        type: 'unknown',
        confidence: 0.2,
        rawText: content,
      }
    }

    // Validate and sanitize the parsed data
    if (receiptData.totalAmount && typeof receiptData.totalAmount === 'string') {
      receiptData.totalAmount = parseFloat(receiptData.totalAmount.replace(/[^\d.]/g, ''))
    }
    if (receiptData.liters && typeof receiptData.liters === 'string') {
      receiptData.liters = parseFloat(receiptData.liters.replace(/[^\d.]/g, ''))
    }
    if (receiptData.pricePerLiter && typeof receiptData.pricePerLiter === 'string') {
      receiptData.pricePerLiter = parseFloat(receiptData.pricePerLiter.replace(/[^\d.]/g, ''))
    }
    if (receiptData.odometer && typeof receiptData.odometer === 'string') {
      receiptData.odometer = parseFloat(receiptData.odometer.replace(/[^\d.]/g, ''))
    }

    return NextResponse.json({ success: true, data: receiptData })
  } catch (error) {
    console.error('[OCR] Receipt scanning error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to scan receipt. Please try again or enter the details manually.', details: msg },
      { status: 500 }
    )
  }
}
