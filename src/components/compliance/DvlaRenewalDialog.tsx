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
import { Loader2, RefreshCw } from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import { useCurrency } from '@/lib/currency-context'
import { toast } from 'sonner'

interface DvlaRenewalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  registration: {
    id: string
    registrationNumber: string
    certificateNumber: string
    expiryDate: string
    registrationFee?: number | null
    renewalFee?: number | null
  } | null
  onSuccess: () => void
}

export function DvlaRenewalDialog({ open, onOpenChange, registration, onSuccess }: DvlaRenewalDialogProps) {
  const { currencySymbol } = useCurrency()
  const [submitting, setSubmitting] = useState(false)

  const [expiryDate, setExpiryDate] = useState('')
  const [certificateNumber, setCertificateNumber] = useState('')
  const [registrationFee, setRegistrationFee] = useState('')
  const [renewalFee, setRenewalFee] = useState('')
  const [notes, setNotes] = useState('')

  // Pre-fill when dialog opens
  React.useEffect(() => {
    if (registration && open) {
      setExpiryDate('')
      setCertificateNumber(registration.certificateNumber)
      setRegistrationFee(registration.registrationFee != null ? String(registration.registrationFee) : '')
      setRenewalFee(registration.renewalFee != null ? String(registration.renewalFee) : '')
      setNotes('')
    }
  }, [registration, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!registration) return

    if (!expiryDate) {
      toast.error('New expiry date is required')
      return
    }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = { expiryDate }

      if (certificateNumber.trim() && certificateNumber.trim() !== registration.certificateNumber) {
        body.certificateNumber = certificateNumber.trim()
      }
      if (registrationFee) body.registrationFee = parseFloat(registrationFee)
      if (renewalFee) body.renewalFee = parseFloat(renewalFee)
      if (notes.trim()) body.notes = notes.trim()

      const res = await fetch(`/api/dvla-registrations/${registration.id}/renewals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Renewal failed' }))
        throw new Error(err.error || 'Renewal failed')
      }

      toast.success('DVLA registration renewed successfully')
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to renew registration')
    } finally {
      setSubmitting(false)
    }
  }

  if (!registration) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-teal-600" />
            Renew DVLA Registration
          </DialogTitle>
          <DialogDescription>
            Renew registration <span className="font-mono font-semibold">{registration.registrationNumber}</span>
            {' '}— a snapshot of the current record will be saved to history.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <DialogBody className="space-y-4">
            {/* Previous Expiry */}
            <div className="rounded-lg bg-muted/50 border p-3">
              <p className="text-xs text-muted-foreground mb-1">Current Expiry</p>
              <p className="text-sm font-medium">
                {new Date(registration.expiryDate).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </p>
            </div>

            {/* New Expiry Date */}
            <div className="space-y-2">
              <Label htmlFor="renewal-expiry">
                New Expiry Date <span className="text-destructive">*</span>
              </Label>
              <DatePicker value={expiryDate} onChange={(val) => setExpiryDate(val)} id="renewal-expiry" />
            </div>

            {/* Certificate Number */}
            <div className="space-y-2">
              <Label htmlFor="renewal-certificate">New Certificate Number</Label>
              <Input
                id="renewal-certificate"
                placeholder={registration.certificateNumber}
                value={certificateNumber}
                onChange={(e) => setCertificateNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Leave unchanged to keep current certificate</p>
            </div>

            {/* Fees */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="renewal-reg-fee">
                  Registration Fee
                  <span className="text-muted-foreground font-normal ml-1">({currencySymbol})</span>
                </Label>
                <Input
                  id="renewal-reg-fee"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={registrationFee}
                  onChange={(e) => setRegistrationFee(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="renewal-fee">
                  Renewal Fee
                  <span className="text-muted-foreground font-normal ml-1">({currencySymbol})</span>
                </Label>
                <Input
                  id="renewal-fee"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={renewalFee}
                  onChange={(e) => setRenewalFee(e.target.value)}
                />
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
                  Renew Registration
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
