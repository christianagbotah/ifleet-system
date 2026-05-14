import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { imageUrl } = body

    if (!imageUrl) {
      return NextResponse.json(
        { success: false, error: 'imageUrl is required' },
        { status: 400 }
      )
    }

    const zai = await ZAI.create()

    const prompt = `This is a Ghana Card (Ghana national ID card). Extract the following information and return ONLY valid JSON:
- cardNumber: The Ghana Card number (format: GHA-XXXXXXXXX-X)
- fullName: Full name on the card
- dateOfBirth: Date of birth if visible
- gender: Gender if visible
- expiryDate: Expiry date if visible

If a field cannot be read, set it to null. Return ONLY the JSON object, no other text.`

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

    const rawText = response.choices?.[0]?.message?.content || ''

    // Extract JSON from the response (handle cases where the model wraps in markdown code blocks)
    let jsonStr = rawText.trim()

    // Try to extract JSON from markdown code blocks if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    // If the text starts with something before the {, trim it
    const braceIndex = jsonStr.indexOf('{')
    if (braceIndex > 0) {
      jsonStr = jsonStr.slice(braceIndex)
    }
    const lastBraceIndex = jsonStr.lastIndexOf('}')
    if (lastBraceIndex >= 0 && lastBraceIndex < jsonStr.length - 1) {
      jsonStr = jsonStr.slice(0, lastBraceIndex + 1)
    }

    const extractedData = JSON.parse(jsonStr)

    return NextResponse.json({
      success: true,
      data: {
        cardNumber: extractedData.cardNumber || null,
        fullName: extractedData.fullName || null,
        dateOfBirth: extractedData.dateOfBirth || null,
        gender: extractedData.gender || null,
        expiryDate: extractedData.expiryDate || null,
      },
    })
  } catch (error) {
    console.error('OCR card extraction error:', error)
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to extract information from card image',
      },
      { status: 500 }
    )
  }
}
