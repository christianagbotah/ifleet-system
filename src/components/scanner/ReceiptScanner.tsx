'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, Upload, X, RotateCcw, Loader2, ScanLine, AlertCircle, CheckCircle2, ImageIcon, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ScannedReceiptData {
  type: 'fuel' | 'general_expense' | 'unknown'
  confidence: number
  date?: string | null
  totalAmount?: number | null
  merchant?: string | null
  reference?: string | null
  liters?: number | null
  pricePerLiter?: number | null
  fuelType?: string | null
  odometer?: number | null
  description?: string | null
  category?: string | null
  paymentMethod?: string | null
  rawText?: string | null
}

interface ReceiptScannerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScanComplete: (data: ScannedReceiptData, imageDataUrl: string) => void
  /** Force scan type - 'fuel' for fuel receipts, 'expense' for general expenses */
  scanType?: 'fuel' | 'expense'
}

type Step = 'capture' | 'processing' | 'results'

// ── Component ──────────────────────────────────────────────────────────────

export function ReceiptScanner({ open, onOpenChange, onScanComplete, scanType }: ReceiptScannerProps) {
  const isMobile = useIsMobile()

  // Use Drawer on mobile, Dialog on desktop
  const ContentWrapper = isMobile ? DrawerContentWrapper : DialogContentWrapper

  return (
    <ContentWrapper
      open={open}
      onOpenChange={onOpenChange}
      scanType={scanType}
      onScanComplete={onScanComplete}
    />
  )
}

// ── Mobile Drawer ──────────────────────────────────────────────────────────

function DrawerContentWrapper({
  open,
  onOpenChange,
  scanType,
  onScanComplete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  scanType?: 'fuel' | 'expense'
  onScanComplete: (data: ScannedReceiptData, imageDataUrl: string) => void
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[95vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            Scan Receipt
          </DrawerTitle>
          <DrawerDescription>
            Take a photo or upload a receipt to auto-fill the form
          </DrawerDescription>
        </DrawerHeader>
        <ScannerContent
          scanType={scanType}
          onScanComplete={onScanComplete}
          onClose={() => onOpenChange(false)}
        />
      </DrawerContent>
    </Drawer>
  )
}

// ── Desktop Dialog ─────────────────────────────────────────────────────────

function DialogContentWrapper({
  open,
  onOpenChange,
  scanType,
  onScanComplete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  scanType?: 'fuel' | 'expense'
  onScanComplete: (data: ScannedReceiptData, imageDataUrl: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            Scan Receipt
          </DialogTitle>
          <DialogDescription>
            Take a photo or upload a receipt to auto-fill the form
          </DialogDescription>
        </DialogHeader>
        <ScannerContent
          scanType={scanType}
          onScanComplete={onScanComplete}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

// ── Main Scanner Content ───────────────────────────────────────────────────

function ScannerContent({
  scanType,
  onScanComplete,
  onClose,
}: {
  scanType?: 'fuel' | 'expense'
  onScanComplete: (data: ScannedReceiptData, imageDataUrl: string) => void
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>('capture')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [scannedData, setScannedData] = useState<ScannedReceiptData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Reset state when dialog reopens
  useEffect(() => {
    if (!imagePreview) {
      setStep('capture')
      setError(null)
      setScannedData(null)
      setProgress(0)
    }
  }, [imagePreview])

  const reset = useCallback(() => {
    setStep('capture')
    setImagePreview(null)
    setScannedData(null)
    setError(null)
    setProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }, [])

  const processImage = useCallback(async (dataUrl: string) => {
    setImagePreview(dataUrl)
    setStep('processing')
    setError(null)
    setScannedData(null)

    // Simulate progress stages
    setProgress(20)

    try {
      setProgress(40)

      const response = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      })

      setProgress(80)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Scan failed' }))
        throw new Error(errorData.error || `Server error: ${response.status}`)
      }

      const result = await response.json()
      setProgress(100)

      const data: ScannedReceiptData = result.data
      setScannedData(data)
      setStep('results')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to scan receipt'
      setError(msg)
      setStep('capture')
      setImagePreview(null)
    }
  }, [])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      if (!file.type.startsWith('image/')) {
        setError('Please select an image file (JPEG, PNG, WebP)')
        return
      }

      if (file.size > 10 * 1024 * 1024) {
        setError('Image must be smaller than 10MB')
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        processImage(dataUrl)
      }
      reader.readAsDataURL(file)
    },
    [processImage]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files?.[0]
      if (!file || !file.type.startsWith('image/')) return

      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        processImage(dataUrl)
      }
      reader.readAsDataURL(file)
    },
    [processImage]
  )

  const handleConfirm = useCallback(() => {
    if (scannedData && imagePreview) {
      onScanComplete(scannedData, imagePreview)
      onClose()
      reset()
    }
  }, [scannedData, imagePreview, onScanComplete, onClose, reset])

  // ── Render: Processing State ──
  if (step === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8 px-4">
        <div className="relative">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <Sparkles className="h-5 w-5 text-amber-500 absolute -top-1 -right-1 animate-pulse" />
        </div>
        <div className="text-center space-y-2 w-full max-w-xs">
          <p className="font-medium text-sm">
            {progress < 40 ? 'Uploading image...' : progress < 80 ? 'AI is reading your receipt...' : 'Extracting data...'}
          </p>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">This usually takes 3-5 seconds</p>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} className="mt-2">
          Cancel
        </Button>
      </div>
    )
  }

  // ── Render: Results State ──
  if (step === 'results' && scannedData) {
    const isFuel = scannedData.type === 'fuel' || scanType === 'fuel'
    const confidence = Math.round((scannedData.confidence || 0) * 100)
    const confidenceColor =
      confidence >= 70 ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
      confidence >= 40 ? 'text-amber-600 bg-amber-50 border-amber-200' :
      'text-red-600 bg-red-50 border-red-200'

    return (
      <div className="space-y-4 px-1 pb-4">
        {/* Preview + Confidence */}
        <div className="flex gap-3">
          {imagePreview && (
            <div className="w-24 h-24 rounded-lg overflow-hidden border flex-shrink-0 bg-muted">
              <img src={imagePreview} alt="Scanned receipt" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className={cn('text-xs border', confidenceColor)}>
                {confidence}% confidence
              </Badge>
              <Badge variant={isFuel ? 'default' : 'secondary'} className="text-xs">
                {isFuel ? '⛽ Fuel Receipt' : '📄 General Expense'}
              </Badge>
            </div>
            {scannedData.merchant && (
              <p className="text-sm font-medium truncate">{scannedData.merchant}</p>
            )}
          </div>
        </div>

        {/* Extracted Data */}
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Extracted Data
          </h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {scannedData.totalAmount != null && (
              <div>
                <span className="text-muted-foreground text-xs">Amount</span>
                <p className="font-semibold">₵{scannedData.totalAmount.toLocaleString()}</p>
              </div>
            )}
            {isFuel && scannedData.liters != null && (
              <div>
                <span className="text-muted-foreground text-xs">Liters</span>
                <p className="font-semibold">{scannedData.liters}L</p>
              </div>
            )}
            {isFuel && scannedData.pricePerLiter != null && (
              <div>
                <span className="text-muted-foreground text-xs">Price/Liter</span>
                <p className="font-semibold">₵{scannedData.pricePerLiter.toFixed(2)}</p>
              </div>
            )}
            {isFuel && scannedData.fuelType && (
              <div>
                <span className="text-muted-foreground text-xs">Fuel Type</span>
                <p className="font-semibold">{scannedData.fuelType}</p>
              </div>
            )}
            {isFuel && scannedData.odometer != null && (
              <div>
                <span className="text-muted-foreground text-xs">Odometer</span>
                <p className="font-semibold">{scannedData.odometer.toLocaleString()} km</p>
              </div>
            )}
            {scannedData.date && (
              <div>
                <span className="text-muted-foreground text-xs">Date</span>
                <p className="font-semibold">{scannedData.date}</p>
              </div>
            )}
            {scannedData.reference && (
              <div>
                <span className="text-muted-foreground text-xs">Reference</span>
                <p className="font-semibold">{scannedData.reference}</p>
              </div>
            )}
            {!isFuel && scannedData.category && (
              <div>
                <span className="text-muted-foreground text-xs">Category</span>
                <p className="font-semibold capitalize">{scannedData.category.replace('_', ' ')}</p>
              </div>
            )}
            {!isFuel && scannedData.description && (
              <div className="col-span-2">
                <span className="text-muted-foreground text-xs">Description</span>
                <p className="font-semibold">{scannedData.description}</p>
              </div>
            )}
            {scannedData.paymentMethod && (
              <div>
                <span className="text-muted-foreground text-xs">Payment</span>
                <p className="font-semibold capitalize">{scannedData.paymentMethod.replace('_', ' ')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Low confidence warning */}
        {confidence < 50 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p className="text-xs">
              Low confidence — please review the extracted data carefully before confirming.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset} className="flex-1">
            <RotateCcw className="h-4 w-4 mr-2" />
            Rescan
          </Button>
          <Button onClick={handleConfirm} className="flex-1">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Use This Data
          </Button>
        </div>
      </div>
    )
  }

  // ── Render: Capture State (default) ──
  return (
    <div className="space-y-4 pb-4 px-1">
      {/* Hidden inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p className="text-xs">{error}</p>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => cameraInputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all duration-200',
          isDragging
            ? 'border-primary bg-primary/5 scale-[1.02]'
            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
        )}
      >
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Camera className="h-8 w-8 text-primary" />
        </div>
        <div className="text-center space-y-1">
          <p className="font-medium text-sm">Tap to take a photo</p>
          <p className="text-xs text-muted-foreground">
            Position the receipt clearly in the frame
          </p>
        </div>
      </div>

      {/* Upload option */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-muted" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">or</span>
        </div>
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => fileInputRef.current?.click()}
      >
        <ImageIcon className="h-4 w-4 mr-2" />
        Upload from Gallery
      </Button>

      {/* Tips */}
      <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Tips for best results:</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li className="flex items-center gap-1.5">
            <span className="text-primary">•</span> Ensure good lighting — avoid shadows on the receipt
          </li>
          <li className="flex items-center gap-1.5">
            <span className="text-primary">•</span> Keep the camera steady and capture the full receipt
          </li>
          <li className="flex items-center gap-1.5">
            <span className="text-primary">•</span> Include the amounts, date, and merchant name
          </li>
        </ul>
      </div>
    </div>
  )
}
