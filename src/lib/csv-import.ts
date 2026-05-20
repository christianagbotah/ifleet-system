/**
 * CSV parsing and validation utilities for importing Drivers and Trucks.
 */

/**
 * Parses CSV text into structured headers and rows.
 * Handles quoted fields, commas inside quotes, and newlines inside quotes.
 */
export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const rows: string[][] = []
  let currentField = ''
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped double quote
        currentField += '"'
        i++ // skip next quote
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false
      } else {
        currentField += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        row.push(currentField.trim())
        currentField = ''
      } else if (char === '\r' && nextChar === '\n') {
        // Windows line ending
        row.push(currentField.trim())
        currentField = ''
        if (row.length > 0 && row.some((cell) => cell !== '')) {
          rows.push(row)
        }
        row = []
        i++ // skip \n
      } else if (char === '\n') {
        row.push(currentField.trim())
        currentField = ''
        if (row.length > 0 && row.some((cell) => cell !== '')) {
          rows.push(row)
        }
        row = []
      } else {
        currentField += char
      }
    }
  }

  // Handle last field/row
  if (currentField !== '' || row.length > 0) {
    row.push(currentField.trim())
    if (row.some((cell) => cell !== '')) {
      rows.push(row)
    }
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] }
  }

  // First row is headers
  const headers = rows[0]
  const dataRows: Record<string, string>[] = []

  for (let i = 1; i < rows.length; i++) {
    const obj: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      const value = rows[i][j] !== undefined ? rows[i][j] : ''
      obj[headers[j]] = value
    }
    dataRows.push(obj)
  }

  return { headers, rows: dataRows }
}

/**
 * Validates a driver row for CSV import.
 */
export function validateDriverRow(row: Record<string, string>): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!row.driverName || row.driverName.trim() === '') {
    errors.push('driverName is required')
  }
  if (!row.phone || row.phone.trim() === '') {
    errors.push('phone is required')
  }
  if (!row.licenseNo || row.licenseNo.trim() === '') {
    errors.push('licenseNo is required')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validates a truck row for CSV import.
 */
export function validateTruckRow(row: Record<string, string>): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!row.plateNumber || row.plateNumber.trim() === '') {
    errors.push('plateNumber is required')
  }
  if (!row.make || row.make.trim() === '') {
    errors.push('make is required')
  }
  if (!row.model || row.model.trim() === '') {
    errors.push('model is required')
  }
  if (!row.year || row.year.trim() === '') {
    errors.push('year is required')
  }

  return { valid: errors.length === 0, errors }
}

/** Maximum rows per import */
export const MAX_IMPORT_ROWS = 100

/** Field definitions for driver CSV import */
export const DRIVER_FIELDS = [
  { key: 'driverName', label: 'Driver Name', required: true },
  { key: 'phone', label: 'Phone', required: true },
  { key: 'licenseNo', label: 'License Number', required: true },
  { key: 'licenseExpiry', label: 'License Expiry', required: false },
  { key: 'status', label: 'Status', required: false },
  { key: 'emergencyContact', label: 'Emergency Contact', required: false },
  { key: 'emergencyPhone', label: 'Emergency Phone', required: false },
  { key: 'address', label: 'Address', required: false },
  { key: 'notes', label: 'Notes', required: false },
] as const

/** Field definitions for truck CSV import */
export const TRUCK_FIELDS = [
  { key: 'plateNumber', label: 'Plate Number', required: true },
  { key: 'make', label: 'Make', required: true },
  { key: 'model', label: 'Model', required: true },
  { key: 'year', label: 'Year', required: true },
  { key: 'fuelType', label: 'Fuel Type', required: false },
  { key: 'status', label: 'Status', required: false },
  { key: 'currentMileage', label: 'Current Mileage', required: false },
  { key: 'tankCapacity', label: 'Tank Capacity (L)', required: false },
  { key: 'vinNumber', label: 'VIN Number', required: false },
  { key: 'engineNumber', label: 'Engine Number', required: false },
  { key: 'chassisNumber', label: 'Chassis Number', required: false },
  { key: 'color', label: 'Color', required: false },
  { key: 'insuranceStatus', label: 'Insurance Status', required: false },
  { key: 'nextServiceDate', label: 'Next Service Date', required: false },
  { key: 'notes', label: 'Notes', required: false },
] as const
