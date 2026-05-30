'use client'

import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertCircle,
  CheckCircle,
  Brain,
  Loader2,
  Scale,
  ChevronRight,
  ArrowUpRight,
} from 'lucide-react'

interface InvoiceDisputeResolution {
  analysis?: string | null
  resolution?: string | null
  creditAmount?: number | null
  currency?: string | null
  validity?: 'valid' | 'partially_valid' | 'invalid' | string
  recommendation?: 'full_credit' | 'partial_credit' | 'no_credit' | 'escalate' | string
  reasoning?: string | null
}

interface InvoiceDisputePanelProps {
  invoiceId: string
  invoiceData?: Record<string, unknown>
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onResolved?: (resolution: InvoiceDisputeResolution) => void
}

function getValidityBadge(validity?: string) {
  switch (validity) {
    case 'valid':
      return <Badge variant="outline" className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800">Valid</Badge>
    case 'partially_valid':
      return <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800">Partially Valid</Badge>
    case 'invalid':
      return <Badge variant="outline" className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800">Invalid</Badge>
    default:
      return null
  }
}

function getRecommendationLabel(rec?: string) {
  switch (rec) {
    case 'full_credit': return 'Full Credit'
    case 'partial_credit': return 'Partial Credit'
    case 'no_credit': return 'No Credit'
    case 'escalate': return 'Escalate to Admin'
    default: return rec || 'Unknown'
  }
}

function formatCredit(amount: number | null | undefined, currency: string | null | undefined): string {
  if (!amount || amount <= 0) return String.fromCodePoint(0x20B5) + '0.00'
  const sym = currency === 'GHS' ? String.fromCodePoint(0x20B5) : (currency || '')
  return `${sym}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function InvoiceDisputePanel({
  invoiceId,
  invoiceData,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onResolved,
}: InvoiceDisputePanelProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined
  const isOpen = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? controlledOnOpenChange! : setInternalOpen

  const [disputeReason, setDisputeReason] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [resolution, setResolution] = useState<InvoiceDisputeResolution | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setDisputeReason('')
    setResolution(null)
    setError(null)
  }, [])

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (value) reset()
      setOpen(value)
    },
    [reset, setOpen]
  )

  const analyzeDispute = useCallback(async () => {
    if (!disputeReason.trim()) return

    setIsAnalyzing(true)
    setError(null)
    setResolution(null)

    try {
      const response = await fetch('/api/ai/invoice-dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          disputeReason,
          invoiceData: invoiceData || {},
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze dispute')
      }

      const result = data.data as InvoiceDisputeResolution
      setResolution(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsAnalyzing(false)
    }
  }, [invoiceId, disputeReason, invoiceData])

  const handleAction = useCallback(
    (action: 'accept' | 'reject' | 'escalate') => {
      if (!resolution) return

      // Invoke the callback with the resolution and action taken
      const result = { ...resolution, _action: action } as InvoiceDisputeResolution & { _action: string }
      onResolved?.(result)

      // Close the panel
      handleOpenChange(false)
    },
    [resolution, onResolved, handleOpenChange]
  )

  const defaultTrigger = trigger || (
    <Button variant="outline" size="sm" className="gap-1.5">
      <Scale className="h-3.5 w-3.5" />
      AI Dispute Resolution
    </Button>
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{defaultTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-amber-500" />
            AI Invoice Dispute Resolution
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dispute reason input */}
          {!resolution && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground">
                  Describe the dispute
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Explain why this invoice is being disputed. Be specific about the issue.
                </p>
              </div>
              <Textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="e.g., The invoice amount does not match the agreed rate. The trip was from Accra to Kumasi, not Accra to Tamale as billed..."
                rows={4}
              />
              <Button
                onClick={analyzeDispute}
                disabled={!disputeReason.trim() || isAnalyzing}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing dispute...
                  </>
                ) : (
                  <>
                    <Brain className="h-4 w-4 mr-2" />
                    Get AI Recommendation
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Loading state */}
          {isAnalyzing && (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg p-3 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p>{error}</p>
                <button
                  className="underline text-xs mt-1 font-medium"
                  onClick={analyzeDispute}
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Resolution result */}
          {resolution && !isAnalyzing && (
            <div className="space-y-4">
              {/* Validity + Recommendation */}
              <div className="flex items-center gap-2 flex-wrap">
                {getValidityBadge(resolution.validity)}
                <Badge variant="outline" className="text-xs">
                  <ChevronRight className="h-3 w-3 mr-0.5" />
                  {getRecommendationLabel(resolution.recommendation)}
                </Badge>
                {(resolution.creditAmount != null && resolution.creditAmount > 0) && (
                  <Badge variant="outline" className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800">
                    Credit: {formatCredit(resolution.creditAmount, resolution.currency)}
                  </Badge>
                )}
              </div>

              {/* Analysis */}
              {resolution.analysis && (
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Analysis</p>
                    <p className="text-sm leading-relaxed">{resolution.analysis}</p>
                  </CardContent>
                </Card>
              )}

              {/* Resolution */}
              {resolution.resolution && (
                <Card className="border-amber-200 dark:border-amber-800">
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">
                      Recommended Resolution
                    </p>
                    <p className="text-sm leading-relaxed">{resolution.resolution}</p>
                  </CardContent>
                </Card>
              )}

              {/* Reasoning */}
              {resolution.reasoning && (
                <details className="group">
                  <summary className="text-sm font-medium text-muted-foreground cursor-pointer flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                    Detailed Reasoning
                  </summary>
                  <p className="text-sm text-muted-foreground mt-2 pl-5 leading-relaxed">
                    {resolution.reasoning}
                  </p>
                </details>
              )}

              <Separator />

              {/* Action buttons */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Choose an action:</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  {(resolution.recommendation === 'full_credit' || resolution.recommendation === 'partial_credit') && (
                    <Button
                      variant="default"
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleAction('accept')}
                    >
                      <CheckCircle className="h-4 w-4 mr-1.5" />
                      Accept Resolution
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleAction('reject')}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleAction('escalate')}
                  >
                    <ArrowUpRight className="h-4 w-4 mr-1.5" />
                    Escalate
                  </Button>
                </div>
              </div>

              {/* Back to input */}
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => {
                  setResolution(null)
                }}
              >
                Modify dispute reason
              </Button>
            </div>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground text-center mt-2">
          AI recommendations are advisory. Final decisions should be reviewed by authorized personnel.
        </p>
      </DialogContent>
    </Dialog>
  )
}
