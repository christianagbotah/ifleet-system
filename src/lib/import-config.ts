/**
 * Import configuration for CSV bulk imports.
 * Each entity type defines its fields, validation rules, and template generation.
 */

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface ImportFieldDef {
  header: string
  key: string
  required: boolean
  type: 'string' | 'number' | 'date' | 'select'
  example?: string
  options?: string[]
}

export interface ImportConfig {
  type: string
  label: string
  icon: string
  fields: ImportFieldDef[]
  defaultStatus?: string
  lookupTruck?: boolean
}

// ────────────────────────────────────────────────────────────────────
// Config Registry
// ────────────────────────────────────────────────────────────────────

const IMPORT_CONFIGS: Record<string, ImportConfig> = {
  drivers: {
    type: 'drivers',
    label: 'Drivers',
    icon: 'User',
    fields: [
      { header: 'First Name', key: 'firstName', required: true, type: 'string', example: 'Kwame' },
      { header: 'Last Name', key: 'lastName', required: true, type: 'string', example: 'Asante' },
      { header: 'Phone', key: 'phone', required: true, type: 'string', example: '0241234567' },
      { header: 'Email', key: 'email', required: false, type: 'string', example: 'kwame@email.com' },
      { header: 'License Number', key: 'licenseNumber', required: true, type: 'string', example: 'DL-2024-001' },
      { header: 'License Expiry', key: 'licenseExpiry', required: true, type: 'date', example: '2027-12-31' },
      { header: 'License Class', key: 'licenseClass', required: true, type: 'select', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], example: 'C' },
      { header: 'Status', key: 'status', required: false, type: 'select', options: ['active', 'inactive', 'suspended'], example: 'active' },
      { header: 'Hire Date', key: 'hireDate', required: false, type: 'date', example: '2024-01-15' },
    ],
    defaultStatus: 'active',
  },
  trucks: {
    type: 'trucks',
    label: 'Trucks',
    icon: 'Truck',
    fields: [
      { header: 'Plate Number', key: 'plateNumber', required: true, type: 'string', example: 'GR-1234-A' },
      { header: 'Make', key: 'make', required: true, type: 'string', example: 'Mercedes-Benz' },
      { header: 'Model', key: 'model', required: true, type: 'string', example: 'Actros' },
      { header: 'Year', key: 'year', required: true, type: 'number', example: '2022' },
      { header: 'Status', key: 'status', required: false, type: 'select', options: ['active', 'inactive', 'maintenance', 'decommissioned'], example: 'active' },
      { header: 'Fuel Type', key: 'fuelType', required: false, type: 'select', options: ['Diesel', 'Petrol', 'Gas'], example: 'Diesel' },
      { header: 'Mileage (km)', key: 'currentMileage', required: false, type: 'number', example: '50000' },
      { header: 'Tank Capacity (L)', key: 'tankCapacity', required: false, type: 'number', example: '400' },
      { header: 'Next Service Date', key: 'nextServiceDate', required: false, type: 'date', example: '2025-06-01' },
      { header: 'Notes', key: 'notes', required: false, type: 'string', example: 'New tyres fitted' },
    ],
    defaultStatus: 'active',
  },
  expenses: {
    type: 'expenses',
    label: 'Expenses',
    icon: 'Receipt',
    fields: [
      { header: 'Date', key: 'date', required: true, type: 'date', example: '2025-01-15' },
      { header: 'Truck', key: 'truckPlateNumber', required: true, type: 'string', example: 'GR-1234-A' },
      { header: 'Category', key: 'category', required: true, type: 'select', options: ['fuel', 'maintenance', 'tyre', 'insurance', 'toll', 'fine', 'permit', 'washing', 'miscellaneous'], example: 'fuel' },
      { header: 'Description', key: 'description', required: true, type: 'string', example: 'Diesel refill - Accra to Kumasi' },
      { header: 'Amount (GHS)', key: 'amount', required: true, type: 'number', example: '1500.00' },
      { header: 'Payment Method', key: 'paymentMethod', required: false, type: 'select', options: ['cash', 'mobile_money', 'bank_transfer'], example: 'cash' },
      { header: 'Reference', key: 'reference', required: false, type: 'string', example: 'RCP-001' },
    ],
    defaultStatus: 'pending',
    lookupTruck: true,
  },
  'fuel-logs': {
    type: 'fuel-logs',
    label: 'Fuel Logs',
    icon: 'Fuel',
    fields: [
      { header: 'Date', key: 'date', required: true, type: 'date', example: '2025-01-15' },
      { header: 'Truck', key: 'truckPlateNumber', required: true, type: 'string', example: 'GR-1234-A' },
      { header: 'Station Name', key: 'stationName', required: false, type: 'string', example: 'Shell Tema Station' },
      { header: 'Fuel Type', key: 'fuelType', required: false, type: 'select', options: ['Diesel', 'Petrol', 'Gas'], example: 'Diesel' },
      { header: 'Liters Filled', key: 'litersFilled', required: true, type: 'number', example: '200' },
      { header: 'Cost/Liter (GHS)', key: 'costPerLiter', required: false, type: 'number', example: '14.50' },
      { header: 'Total Cost (GHS)', key: 'totalCost', required: false, type: 'number', example: '2900.00' },
      { header: 'Odometer (km)', key: 'odometer', required: false, type: 'number', example: '52000' },
      { header: 'Receipt Number', key: 'receiptNumber', required: false, type: 'string', example: 'FUE-001' },
    ],
    lookupTruck: true,
  },
  maintenance: {
    type: 'maintenance',
    label: 'Maintenance Records',
    icon: 'Wrench',
    fields: [
      { header: 'Truck', key: 'truckPlateNumber', required: true, type: 'string', example: 'GR-1234-A' },
      { header: 'Type', key: 'type', required: true, type: 'select', options: ['routine', 'repair', 'emergency', 'inspection'], example: 'routine' },
      { header: 'Title', key: 'title', required: true, type: 'string', example: 'Oil Change & Filter Replacement' },
      { header: 'Description', key: 'description', required: false, type: 'string', example: 'Full synthetic oil change' },
      { header: 'Cost (GHS)', key: 'cost', required: false, type: 'number', example: '800.00' },
      { header: 'Performed By', key: 'performedBy', required: false, type: 'string', example: 'AutoMech Garage' },
      { header: 'Performed At', key: 'performedAt', required: false, type: 'date', example: '2025-01-15' },
      { header: 'Odometer (km)', key: 'odometer', required: false, type: 'number', example: '52000' },
      { header: 'Next Due Date', key: 'nextDueDate', required: false, type: 'date', example: '2025-04-15' },
      { header: 'Next Due Mileage (km)', key: 'nextDueMileage', required: false, type: 'number', example: '60000' },
      { header: 'Status', key: 'status', required: false, type: 'select', options: ['pending', 'in_progress', 'completed'], example: 'completed' },
      { header: 'Notes', key: 'notes', required: false, type: 'string', example: 'Used genuine OEM parts' },
    ],
    defaultStatus: 'completed',
    lookupTruck: true,
  },
}

// ────────────────────────────────────────────────────────────────────
// Functions
// ────────────────────────────────────────────────────────────────────

/**
 * Get the import configuration for a given entity type.
 */
export function getImportConfig(type: string): ImportConfig {
  return IMPORT_CONFIGS[type] || IMPORT_CONFIGS['drivers']
}

/**
 * Generate a CSV template string for a given entity type.
 * Includes headers and a sample data row.
 */
export function generateImportTemplate(type: string): string {
  const config = getImportConfig(type)
  const headers = config.fields.map((f) => {
    const marker = f.required ? '*' : ''
    const typeHint = f.type === 'select' && f.options ? ` (${f.options.join('/')})` : ''
    return `${f.header}${marker}${typeHint}`
  })

  const sampleRow = config.fields.map((f) => f.example || '')

  // Header row with required field marker explanation
  const headerLine = headers.join(',')
  const sampleLine = sampleRow.join(',')
  const noteLine = '* = required field'

  return [noteLine, '', headerLine, sampleLine].join('\n')
}
