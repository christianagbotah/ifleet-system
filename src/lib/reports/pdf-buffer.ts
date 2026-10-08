import type jsPDF from 'jspdf'

export function jsPdfToBuffer(doc: jsPDF): Buffer {
  const output = doc.output('arraybuffer')
  return Buffer.from(output)
}
