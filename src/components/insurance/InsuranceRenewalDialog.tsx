'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, RefreshCw } from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import { INSURANCE_TYPES } from '@/lib/constants'
import { useCurrency } from '@/lib/currency-context'
import { toast } from 'sonner'

interface InsuranceRenewalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  insurance: {
    id: string
    policyNumber: string
    provider: string
    type: string
    coverAmount?: number | null
    premium: number
    startDate: string
    endDate: string
    notes?: string | null
  } | null
  onSuccess: () => void
}

export function InsuranceRenewalDialog({ open, onOpenChange, insurance, onSuccess }: InsuranceRenewalDialogProps) {
  const { currencySymbol } = useCurrency()
  const [submitting, setSubmitting] = useState(false)

  const [policyNumber, setPolicyNumber] = useState('')
  const [provider, setProvider] = useState('')
  const [type, setType] = useState('')
  const [coverAmount, setCoverAmount] = useState('')
  const [premium, setPremium] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')

  // Pre-fill when dialog opens
  React.useEffect(() => {
    if (insurance && open) {
      setPolicyNumber(insurance.policyNumber)
      setProvider(insurance.provider)
      setType(insurance.type)
      setCoverAmount(insurance.coverAmount != null ? String(insurance.coverAmount) : '')
      setPremium(String(insurance.premium))
      // Default start date to the day after current end date
      const currentEnd = new Date(insurance.endDate)
      const nextDay = new Date(currentEnd)
      nextDay.setDate(nextDay.getDate() + 1)
      setStartDate(nextDay.toISOString().split('T')[0])
      setEndDate('')
      setNotes('')
    }
  }, [insurance, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!insurance) return

    if (!endDate) {
      toast.error('New end date is required')
      return
    }
    if (!premium || parseFloat(premium) <= 0) {
      toast.error('Valid premium amount is required')
      return
    }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        endDate,
        premium: parseFloat(premium),
      }

      if (policyNumber.trim() && policyNumber.trim() !== insurance.policyNumber) {
        body.policyNumber = policyNumber.trim()
      }
      if (provider.trim() && provider.trim() !== insurance.provider) {
        body.provider = provider.trim()
      }
      if (type && type !== insurance.type) {
        body.type = type
      }
      if (coverAmount) body.coverAmount = parseFloat(coverAmount)
      if (startDate) body.startDate = startDate
      if (notes.trim()) body.notes = notes.trim()

      const res = await fetch(`/api/insurance/${insurance.id}/renewals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Renewal failed' }))
        throw new Error(err.error || 'Renewal failed')
      }

      toast.success('Insurance policy renewed successfully')
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to renew insurance policy')
    } finally {
      setSubmitting(false)
    }
  }

  if (!insurance) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-emerald-500" />
            Renew Insurance Policy
          </DialogTitle>
          <DialogDescription>
            Renew policy <span className="font-mono font-semibold">{insurance.policyNumber}</span>
            {' '}— a snapshot of the current policy will be saved to history.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <DialogBody className="space-y-4">
            {/* Current Policy Info */}
            <div className="rounded-lg bg-muted/50 border p-3 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Provider</span>
                <span className="font-medium">{insurance.provider}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Current Period</span>
                <span className="font-medium">
                  {new Date(insurance.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {' — '}
                  {new Date(insurance.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Current Premium</span>
                <span className="font-medium">{currencySymbol}{insurance.premium.toLocaleString()}</span>
              </div>
            </div>

            {/* Policy Number & Provider */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="renewal-policy">Policy Number</Label>
                <Input
                  id="renewal-policy"
                  value={policyNumber}
                  onChange={(e) => setPolicyNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="renewal-provider">Provider</Label>
                <Input
                  id="renewal-provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                />
              </div>
            </div>

            {/* Type & Cover Amount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Insurance Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INSURANCE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="renewal-cover">
                  Cover Amount ({currencySymbol})
                </Label>
                <Input
                  id="renewal-cover"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={coverAmount}
                  onChange={(e) => setCoverAmount(e.target.value)}
                />
              </div>
            </div>

            {/* Premium */}
            <div className="space-y-2">
              <Label htmlFor="renewal-premium">
                New Premium <span className="text-destructive">*</span>
                <span className="text-muted-foreground font-normal ml-1">({currencySymbol})</span>
              </Label>
              <Input
                id="renewal-premium"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="renewal-start">Start Date</Label>
                <DatePicker value={startDate} onChange={(val) => setStartDate(val)} id="renewal-start" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="renewal-end">
                  End Date <span className="text-destructive">*</span>
                </Label>
                <DatePicker value={endDate} onChange={(val) => setEndDate(val)} id="renewal-end" />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="renewal-notes">Notes</Label>
              <textarea
                id="renewal-notes"
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                placeholder="Any renewal notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Renewing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Renew Policy
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
