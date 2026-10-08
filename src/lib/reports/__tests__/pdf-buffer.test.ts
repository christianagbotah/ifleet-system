import { describe, expect, it } from 'vitest'
import jsPDF from 'jspdf'

import { jsPdfToBuffer } from '@/lib/reports/pdf-buffer'

describe('jsPdfToBuffer', () => {
  it('returns a non-empty PDF buffer from a jsPDF document', () => {
    const doc = new jsPDF()
    doc.text('Phase 2 UAT', 10, 10)
    const buffer = jsPdfToBuffer(doc)
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.length).toBeGreaterThan(500)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })
})
