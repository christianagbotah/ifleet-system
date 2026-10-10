import fs from 'node:fs'
import path from 'node:path'

const FORBIDDEN_FIELDS = new Set([
  'userid', 'driverid', 'truckid', 'trailerid', 'employeeid',
  'drivername', 'customername', 'contactname', 'recipientname', 'ownername',
  'name', 'email', 'phone', 'address', 'contactphone', 'contactemail',
  'ghanacardnumber', 'licensenumber', 'vin', 'vinnumber', 'platenumber',
  'vehicleplatenumber', 'registrationnumber', 'policynumber',
  'password', 'token', 'secret',
])

function normalizedFieldName(field: string): string {
  return field.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isSensitiveIdentityField(field: string): boolean {
  const normalized = normalizedFieldName(field)
  if (FORBIDDEN_FIELDS.has(normalized)) return true
  if (/(email|phone|password|token|secret)$/.test(normalized)) return true
  if (/^(driver|customer|contact|recipient|owner|user|employee).*(id|name|email|phone|address)$/.test(normalized)) return true
  if (/(ghanacardnumber|licensenumber|vinnumber|platenumber|registrationnumber|policynumber)$/.test(normalized)) return true
  return false
}

export interface TrainingExportConfig {
  featureFields: string[]
  labelFields: string[]
}

export function sanitizeTrainingRows(
  rows: Array<Record<string, unknown>>,
  config: TrainingExportConfig,
): Array<Record<string, unknown>> {
  const operationalFields = [...config.featureFields, ...config.labelFields].filter(
    (field, index, all) => all.indexOf(field) === index && !isSensitiveIdentityField(field),
  )
  const operationalFeatures = config.featureFields.filter(
    (field) => !isSensitiveIdentityField(field),
  )

  if (operationalFeatures.length === 0) {
    throw new Error('Training export requires at least one usable operational feature.')
  }

  return rows.map((row) => Object.fromEntries(
    operationalFields
      .filter((field) => Object.prototype.hasOwnProperty.call(row, field))
      .map((field) => [field, row[field]]),
  ))
}

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

async function main() {
  const input = readArg('input')
  const output = readArg('output')
  const features = readArg('features')
  const labels = readArg('labels') ?? ''
  if (!input || !output || !features) {
    throw new Error('Usage: bun scripts/ai/export-training-dataset.ts --input=rows.json --output=dataset.json --features=a,b --labels=label')
  }

  const rows = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8')) as Array<Record<string, unknown>>
  if (!Array.isArray(rows)) throw new Error('Input dataset must be a JSON array.')

  const sanitized = sanitizeTrainingRows(rows, {
    featureFields: features.split(',').map((value) => value.trim()).filter(Boolean),
    labelFields: labels.split(',').map((value) => value.trim()).filter(Boolean),
  })

  fs.writeFileSync(path.resolve(output), `${JSON.stringify(sanitized, null, 2)}\n`)
  console.log(JSON.stringify({ rows: sanitized.length, output: path.resolve(output) }))
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
