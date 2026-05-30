'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Loader2, ScanLine, Upload, X, FileText, Fuel, ShoppingBag, Truck, AlertCircle } from 'lucide-react'

interface ExtractedData {
  type?: string
  vendor?: string | null
  date?: string | null
  totalAmount?: number | null
  currency?: string | null
  items?: Array<{ description: string; quantity: number; unitPrice: number }>
  fuelLiters?: number | null
  fuelType?: string | null
  notes?: string | null
  raw?: string
}

interface DocumentScannerProps {
  /** Called when extraction succeeds with structured data */
  onExtracted?: (data: ExtractedData) => void
  /** Optional context label (e.g. "Fuel Log", "Expense") */
  context?: string
  /** Trigger element - renders a DialogTrigger if provided */
  trigger?: React.ReactNode
  /** Force open state (controlled mode) */
  open?: boolean
  /** Force close callback (controlled mode) */
  onOpenChange?: (open: boolean) => void
}

function formatAmount(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null) return 'N/A'
  const sym = currency === 'GHS' ? String.fromCodePoint(0x20B5) : (currency || '')
  return `${sym}${amount.toLocaleString()}`
}

function getTypeIcon(type?: string) {
  switch (type) {
    case 'fuel_receipt': return <Fuel className="h-4 w-4" />
    case 'expense_receipt': return <ShoppingBag className="h-4 w-4" />
    case 'delivery_note': return <Truck className="h-4 w-4" />
    case 'invoice': return <FileText className="h-4 w-4" />
    default: return <FileText className="h-4 w-4" />
  }
}

function getTypeLabel(type?: string) {
  switch (type) {
    case 'fuel_receipt': return 'Fuel Receipt'
    case 'expense_receipt': return 'Expense Receipt'
    case 'delivery_note': return 'Delivery Note'
    case 'invoice': return 'Invoice'
    default: return 'Document'
  }
}

export function DocumentScanner({
  onExtracted,
  context,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: DocumentScannerProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined
  const isOpen = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? controlledOnOpenChange! : setInternalOpen

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const reset = useCallback(() => {
    setFile(null)
    setPreview(null)
    setExtractedData(null)
    setError(null)
  }, [])

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (value) reset()
      setOpen(value)
    },
    [reset, setOpen]
  )

  const handleFile = useCallback((selectedFile: File) => {
    if (!selectedFile.type.startsWith('image/')) {
      setError('Please upload an image file (JPEG, PNG, WebP, etc.)')
      return
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File is too large. Maximum size is 10 MB.')
      return
    }

    setFile(selectedFile)
    setError(null)
    setExtractedData(null)

    // Create preview
    if (preview) URL.revokeObjectURL(preview)
    const url = URL.createObjectURL(selectedFile)
    setPreview(url)
  }, [preview])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) handleFile(droppedFile)
    },
    [handleFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const analyzeDocument = useCallback(async () => {
    if (!file) return

    setIsAnalyzing(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/ai/analyze-document', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze document')
      }

      const extracted = data.data as ExtractedData
      setExtractedData(extracted)
      onExtracted?.(extracted)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsAnalyzing(false)
    }
  }, [file, onExtracted])

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-amber-500" />
            Scan Document{context ? ` — ${context}` : ''}
          </DialogTitle>
        </DialogHeader>

        {/* Upload area */}
        {!file && (
          <div
            ref={dropRef}
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground">
              Drag & drop an image or click to browse
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              JPEG, PNG, WebP — max 10 MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </div>
        )}

        {/* Image preview */}
        {file && preview && (
          <div className="space-y-4">
            <div className="relative rounded-lg overflow-hidden border bg-muted">
              <img
                src={preview}
                alt="Document preview"
                className="w-full h-48 object-contain"
              />
              {!isAnalyzing && !extractedData && (
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7 rounded-full"
                  onClick={() => {
                    setFile(null)
                    setPreview(null)
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Analyze button */}
            {!extractedData && (
              <Button
                onClick={analyzeDocument}
                disabled={isAnalyzing}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing document...
                  </>
                ) : (
                  <>
                    <ScanLine className="h-4 w-4 mr-2" />
                    Analyze Document
                  </>
                )}
              </Button>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg p-3 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p>{error}</p>
                  <button
                    className="underline text-xs mt-1 font-medium"
                    onClick={analyzeDocument}
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            {/* Extracted data */}
            {extractedData && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(extractedData.type)}
                    <span className="text-sm font-medium">
                      {getTypeLabel(extractedData.type)}
                    </span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    AI Extracted
                  </Badge>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Vendor</p>
                    <p className="font-medium">{extractedData.vendor || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="font-medium">{extractedData.date || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Amount</p>
                    <p className="font-medium text-amber-600 dark:text-amber-400">
                      {formatAmount(extractedData.totalAmount, extractedData.currency)}
                    </p>
                  </div>
                  {(extractedData.type === 'fuel_receipt') && extractedData.fuelLiters != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Fuel (Liters)</p>
                      <p className="font-medium">
                        {extractedData.fuelLiters.toLocaleString()} L
                        {extractedData.fuelType ? ` (${extractedData.fuelType})` : ''}
                      </p>
                    </div>
                  )}
                </div>

                {/* Items table */}
                {extractedData.items && extractedData.items.length > 0 && (
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Line Items</p>
                      <div className="space-y-1.5">
                        {extractedData.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <div className="flex-1">
                              <span>{item.description}</span>
                              {item.quantity > 1 && (
                                <span className="text-muted-foreground ml-1">
                                  x{item.quantity}
                                </span>
                              )}
                            </div>
                            <span className="font-medium ml-2">
                              {formatAmount(item.unitPrice * item.quantity, extractedData.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {extractedData.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm">{extractedData.notes}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setExtractedData(null)
                      setFile(null)
                      setPreview(null)
                    }}
                    className="flex-1"
                  >
                    Scan Another
                  </Button>
                  <Button
                    onClick={() => handleOpenChange(false)}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground text-center mt-2">
          AI may not always be accurate. Verify extracted data before saving.
        </p>
      </DialogContent>
    </Dialog>
  )
}
