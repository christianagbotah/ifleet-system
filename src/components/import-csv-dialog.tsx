'use client'

import React, { useState, useCallback, useRef } from 'react'
import Papa from 'papaparse'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Trash2,
  Table2,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { generateImportTemplate, type ImportConfig } from '@/lib/import-config'

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

interface ImportError {
  row: number
  field: string
  message: string
}

interface ImportResult {
  success: number
  failed: number
  errors: { row: number; message: string }[]
}

interface ImportCSVDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: string
  label: string
  onSuccess?: () => void
}

// ────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────

export function ImportCSVDialog({
  open,
  onOpenChange,
  type,
  label,
  onSuccess,
}: ImportCSVDialogProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'result'>('upload')
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [validationErrors, setValidationErrors] = useState<ImportError[]>([])
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const config = (await_getConfig(type))
  const totalRows = rawRows.length

  // ── Template download ──
  const handleDownloadTemplate = useCallback(() => {
    try {
      const csv = generateImportTemplate(type)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fleetpro-${type}-import-template.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setServerError('Failed to generate template')
    }
  }, [type])

  // ── File parsing ──
  const handleFile = useCallback(
    (file: File) => {
      setServerError(null)
      setResult(null)

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            setServerError(
              `CSV parsing error: ${results.errors[0].message} (row ${results.errors[0].row})`
            )
            return
          }
          const rows = results.data as Record<string, string>[]
          if (rows.length === 0) {
            setServerError('The file is empty. Please add data rows.')
            return
          }

          setRawRows(rows)

          // Validate
          const errors: ImportError[] = []
          const requiredFields = config.fields.filter((f) => f.required)

          rows.forEach((row, idx) => {
            const rowNum = idx + 1
            // Check required fields
            for (const field of requiredFields) {
              const val = (row[field.header] || '').trim()
              if (!val) {
                errors.push({
                  row: rowNum,
                  field: field.header,
                  message: `"${field.header}" is required`,
                })
              }
            }

            // Validate select fields
            config.fields.forEach((field) => {
              if (field.type === 'select' && field.options) {
                const val = (row[field.header] || '').trim()
                if (val && !field.options.includes(val)) {
                  errors.push({
                    row: rowNum,
                    field: field.header,
                    message: `Invalid "${field.header}": "${val}". Allowed: ${field.options.join(', ')}`,
                  })
                }
              }
            })

            // Validate number fields
            config.fields.forEach((field) => {
              if (field.type === 'number') {
                const val = (row[field.header] || '').trim()
                if (val && isNaN(Number(val))) {
                  errors.push({
                    row: rowNum,
                    field: field.header,
                    message: `"${field.header}" must be a number, got "${val}"`,
                  })
                }
              }
            })

            // Validate date fields
            config.fields.forEach((field) => {
              if (field.type === 'date') {
                const val = (row[field.header] || '').trim()
                if (val) {
                  const d = new Date(val)
                  if (isNaN(d.getTime())) {
                    errors.push({
                      row: rowNum,
                      field: field.header,
                      message: `Invalid date "${val}" for "${field.header}". Use YYYY-MM-DD format.`,
                    })
                  }
                }
              }
            })
          })

          setValidationErrors(errors)
          setStep('preview')
        },
        error: (err) => {
          setServerError(`Failed to parse CSV: ${err.message}`)
        },
      })
    },
    [config]
  )

  // ── Drag & drop handlers ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
        handleFile(file)
      } else {
        setServerError('Please upload a .csv file')
      }
    },
    [handleFile]
  )

  // ── File input change ──
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      // Reset so same file can be re-selected
      e.target.value = ''
    },
    [handleFile]
  )

  // ── Import execution ──
  const handleImport = useCallback(async () => {
    setStep('importing')
    setProgress(0)
    setServerError(null)

    try {
      const res = await apiFetch<ImportResult>('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, rows: rawRows }),
      })

      setProgress(100)
      setResult(res)
      setStep('result')
      if (res.success > 0 && onSuccess) {
        onSuccess()
      }
    } catch (err: any) {
      setServerError(err?.message || 'Import failed. Please try again.')
      setStep('preview')
    }
  }, [type, rawRows, onSuccess])

  // ── Reset dialog ──
  const handleReset = useCallback(() => {
    setStep('upload')
    setRawRows([])
    setValidationErrors([])
    setProgress(0)
    setResult(null)
    setServerError(null)
  }, [])

  const handleClose = useCallback(
    (val: boolean) => {
      if (!val) handleReset()
      onOpenChange(val)
    },
    [handleReset, onOpenChange]
  )

  const hasBlockingErrors = validationErrors.length > 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="md:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-amber-500" />
            Import {label}
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to bulk import {label.toLowerCase()} data
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {serverError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/20 flex items-start gap-2">
              <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-400">{serverError}</p>
            </div>
          )}

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Template download */}
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/20">
                <p className="text-sm text-amber-800 dark:text-amber-300 mb-2">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  First time? Download the template to see the required format:
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className="gap-2 border-amber-300 dark:border-amber-700"
                >
                  <Download className="h-4 w-4" />
                  Download Template
                </Button>
              </div>

              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                  dragOver
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/10'
                    : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium">
                  Drag & drop your CSV file here, or <span className="text-amber-600 dark:text-amber-400 underline">browse</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports .csv files up to 5MB
                </p>
              </div>

              {/* Field reference */}
              <div className="text-xs text-muted-foreground">
                <p className="font-medium mb-1 flex items-center gap-1">
                  <Table2 className="h-3 w-3" />
                  Required columns:
                </p>
                <div className="flex flex-wrap gap-1">
                  {config.fields
                    .filter((f) => f.required)
                    .map((f) => (
                      <Badge key={f.key} variant="secondary" className="text-[10px] font-mono">
                        {f.header}
                      </Badge>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/50">
                <span className="text-sm font-medium">
                  {totalRows} row{totalRows !== 1 ? 's' : ''} found
                </span>
                {hasBlockingErrors ? (
                  <Badge variant="destructive" className="text-xs gap-1">
                    <XCircle className="h-3 w-3" />
                    {validationErrors.length} error{validationErrors.length !== 1 ? 's' : ''}
                  </Badge>
                ) : (
                  <Badge variant="default" className="text-xs gap-1 bg-emerald-600">
                    <CheckCircle2 className="h-3 w-3" />
                    Ready to import
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto gap-1 text-xs"
                  onClick={handleReset}
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </Button>
              </div>

              {/* Validation errors */}
              {hasBlockingErrors && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/20">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-2 flex items-center gap-1">
                    <XCircle className="h-4 w-4" />
                    Validation Errors (must fix before importing):
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {validationErrors.slice(0, 20).map((err, i) => (
                      <p key={i} className="text-xs text-red-600 dark:text-red-400">
                        Row {err.row}: {err.field} — {err.message}
                      </p>
                    ))}
                    {validationErrors.length > 20 && (
                      <p className="text-xs text-red-400">
                        ...and {validationErrors.length - 20} more errors
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Preview table */}
              <div className="border rounded-lg overflow-hidden">
                <ScrollArea className="max-h-[40vh]">
                  <div className="min-w-[600px]">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/80">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-muted/80 z-10">
                            #
                          </th>
                          {config.fields.map((f) => (
                            <th key={f.key} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
                              {f.header}
                              {f.required && <span className="text-red-500 ml-0.5">*</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rawRows.slice(0, 50).map((row, idx) => {
                          const rowErrors = validationErrors.filter((e) => e.row === idx + 1)
                          return (
                            <tr
                              key={idx}
                              className={`border-t ${rowErrors.length > 0 ? 'bg-red-50/50 dark:bg-red-900/5' : idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}
                            >
                              <td className="px-3 py-2 text-muted-foreground sticky left-0 bg-background z-10">
                                {idx + 1}
                              </td>
                              {config.fields.map((f) => (
                                <td
                                  key={f.key}
                                  className={`px-3 py-2 whitespace-nowrap max-w-[200px] truncate ${
                                    rowErrors.some((e) => e.field === f.header)
                                      ? 'text-red-600 dark:text-red-400 font-medium'
                                      : ''
                                  }`}
                                >
                                  {(row[f.header] || '').trim() || (
                                    <span className="text-muted-foreground/40 italic">empty</span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
                {rawRows.length > 50 && (
                  <div className="px-3 py-2 border-t bg-muted/30 text-xs text-muted-foreground text-center">
                    Showing 50 of {rawRows.length} rows
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
              <p className="text-sm font-medium">Importing {totalRows} {label.toLowerCase()}...</p>
              <Progress value={progress} className="w-64 h-2" />
              <p className="text-xs text-muted-foreground">Please don&apos;t close this dialog</p>
            </div>
          )}

          {/* Step 4: Result */}
          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-6 py-4">
                {/* Success */}
                <div className="text-center">
                  <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                    {result.success}
                  </div>
                  <p className="text-xs text-muted-foreground">Imported</p>
                </div>
                <div className="h-12 w-px bg-border" />
                {/* Failed */}
                <div className="text-center">
                  <div className={`text-3xl font-bold ${result.failed > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                    {result.failed}
                  </div>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>

              {/* Failure details */}
              {result.failed > 0 && result.errors.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/20">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">
                    Failed rows:
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {result.errors.map((err, i) => (
                      <p key={i} className="text-xs text-amber-600 dark:text-amber-500">
                        Row {err.row}: {err.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/20 text-center">
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  {result.success > 0
                    ? `Successfully imported ${result.success} ${label.toLowerCase()}.`
                    : 'No records were imported.'}
                </p>
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {step === 'upload' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </>
          )}

          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleReset}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={hasBlockingErrors || totalRows === 0}
                className="bg-amber-500 hover:bg-amber-600 text-white gap-2"
              >
                <Upload className="h-4 w-4" />
                Import {totalRows} {label.toLowerCase()}
              </Button>
            </>
          )}

          {step === 'result' && (
            <Button onClick={() => onOpenChange(false)} className="bg-amber-500 hover:bg-amber-600 text-white">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Helper to get config synchronously (config is static)
function await_getConfig(type: string): ImportConfig {
  // Dynamic import would be async, but config is static so this is fine
  const configs: Record<string, ImportConfig> = {
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
        { header: 'Amount (₵)', key: 'amount', required: true, type: 'number', example: '1500.00' },
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
        { header: 'Cost/Liter (₵)', key: 'costPerLiter', required: false, type: 'number', example: '14.50' },
        { header: 'Total Cost (₵)', key: 'totalCost', required: false, type: 'number', example: '2900.00' },
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
        { header: 'Cost (₵)', key: 'cost', required: false, type: 'number', example: '800.00' },
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
  return configs[type] || configs['drivers'] // fallback
}
