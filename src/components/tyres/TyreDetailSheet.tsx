'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  CircleDot, Truck, Tag, CalendarDays, DollarSign,
  ClipboardCheck, Archive, Clock, ArrowRightCircle,
  Pencil, Trash2, RefreshCw,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
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
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useCurrency } from '@/lib/currency-context'
import { useAuthStore } from '@/lib/store/auth'
import { apiFetch } from '@/lib/api'
import { TYRE_CONDITIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

// ─── Condition change order ─────────────────────────────────────────
const CONDITION_ORDER = ['new', 'good', 'fair', 'worn', 'damaged', 'replaced'] as const
const RETIRING_CONDITIONS = new Set(['damaged', 'replaced'])

// ─── Types ──────────────────────────────────────────────────────────

interface TyreDetailSheetProps {
  tyre: {
    id: string
    serialNumber: string
    brand: string
    purchaseDate: string
    purchasePrice: number
    condition: string
    notes?: string | null
    retiredDate?: string | null
    retiredReason?: string | null
    lastInspection?: string | null
    truck: { id: string;
plateNumber: string; make: string; model: string }
  } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: (tyre: NonNullable<TyreDetailSheetProps['tyre']>) => void
  onDeleted?: () => void
}

interface TyreFull extends NonNullable<TyreDetailSheetProps['tyre']> {
  createdAt?: string
  updatedAt?: string
}

// ─── Main Component ────────────────────────────────────────────────

export function TyreDetailSheet({ tyre, open, onOpenChange, onEdit, onDeleted }: TyreDetailSheetProps) {
  const { currencySymbol } = useCurrency()
  const { user } = useAuthStore()
  const canWrite = user?.role !== 'Driver'

  const [fullTyre, setFullTyre] = React.useState<TyreFull | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [conditionDialogOpen, setConditionDialogOpen] = React.useState(false)

  React.useEffect(() => {
    if (open && tyre) {
      setLoading(true)
      apiFetch<TyreFull>(`/api/tyres/${tyre.id}`)
        .then((data) => setFullTyre(data))
        .catch((err) => console.error('Failed to fetch tyre details:', err))
        .finally(() => setLoading(false))
    }
    if (!open) {
      setFullTyre(null)
    }
  }, [open, tyre])

  const handleDelete = async () => {
    if (!tyre) return
    setDeleting(true)
    try {
      await apiFetch(`/api/tyres/${tyre.id}`, { method: 'DELETE' })
      toast.success('Tyre deleted successfully')
      onOpenChange(false)
      onDeleted?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete tyre')
    } finally {
      setDeleting(false)
    }
  }

  const handleConditionChanged = async () => {
    // Re-fetch the tyre to get updated data
    if (tyre) {
      try {
        const data = await apiFetch<TyreFull>(`/api/tyres/${tyre.id}`)
        setFullTyre(data)
      } catch {
        // silently refresh from parent
      }
      onDeleted?.() // triggers parent refetch
    }
    setConditionDialogOpen(false)
  }

  const currentTyre = fullTyre || tyre
  if (!currentTyre) return null

  const isRetired = !!currentTyre.retiredDate
  const conditionMeta = TYRE_CONDITIONS[currentTyre.condition as keyof typeof TYRE_CONDITIONS]
  const ageInDays = Math.floor(
    (Date.now() - new Date(currentTyre.purchaseDate).getTime()) / (1000 * 60 * 60 * 24)
  )

  const formatDate = (dt: string) => {
    try {
      return new Date(dt).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    } catch { return dt }
  }

  const formatDateTime = (dt: string) => {
    try {
      return new Date(dt).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return dt }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        {/* Header */}
        <SheetHeader className="shrink-0 px-5 sm:px-6 pt-5 sm:pt-5">
          <SheetTitle className="flex items-center gap-2">
            <CircleDot className="h-5 w-5 text-amber-500" />
            Tyre Details
          </SheetTitle>
          <SheetDescription>
            {currentTyre.serialNumber}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="mt-4 px-5 sm:px-6 space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 space-y-0 overflow-y-auto flex-1 min-h-0 pb-8 sm:pb-6"
            style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
          >
            {/* Hero: Condition + Price + Age */}
            <div className="mx-5 sm:mx-6 rounded-xl border bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 p-4">
              <div className="flex items-center justify-between mb-3">
                {conditionMeta ? (
                  <Badge className={cn('border-transparent font-semibold text-sm px-3 py-1', conditionMeta.color)}>
                    {conditionMeta.label}
                  </Badge>
                ) : (
                  <Badge variant="outline">{currentTyre.condition}</Badge>
                )}
                {isRetired && (
                  <Badge variant="outline" className="border-orange-300 text-orange-600 dark:text-orange-400">
                    <Archive className="h-3 w-3 mr-1" /> Retired
                  </Badge>
                )}
              </div>
              <p className="text-2xl font-bold text-foreground">
                {currencySymbol}{currentTyre.purchasePrice.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Purchase price · {ageInDays} day{ageInDays !== 1 ? 's' : ''} ago
              </p>
            </div>

            {/* Retired Warning */}
            {isRetired && currentTyre.retiredReason && (
              <div className="mx-5 sm:mx-6 mt-3 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800 p-3">
                <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-0.5">Retirement Reason</p>
                <p className="text-sm text-orange-700 dark:text-orange-300">{currentTyre.retiredReason}</p>
                <p className="text-xs text-orange-500 dark:text-orange-400 mt-1">Retired on {formatDate(currentTyre.retiredDate!)}</p>
              </div>
            )}

            {/* Detail Rows — Two Column Grid */}
            <div className="mx-5 sm:mx-6 mt-4 rounded-lg border">
              <div className="grid grid-cols-2">
                <DetailCell
                  icon={<Tag className="h-3.5 w-3.5" />}
                  label="Serial Number"
                  value={currentTyre.serialNumber}
                  mono
                />
                <DetailCell
                  icon={<Tag className="h-3.5 w-3.5" />}
                  label="Brand"
                  value={currentTyre.brand}
                />
                <DetailCell
                  icon={<Truck className="h-3.5 w-3.5" />}
                  label="Assigned Truck"
                  value={currentTyre.truck.plateNumber}
                  sub={`${currentTyre.truck.make} ${currentTyre.truck.model}`}
                />
                <DetailCell
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                  label="Purchase Date"
                  value={formatDate(currentTyre.purchaseDate)}
                />
                <DetailCell
                  icon={<DollarSign className="h-3.5 w-3.5" />}
                  label="Purchase Price"
                  value={`${currencySymbol}${currentTyre.purchasePrice.toLocaleString()}`}
                />
                <DetailCell
                  icon={<ClipboardCheck className="h-3.5 w-3.5" />}
                  label="Last Inspection"
                  value={currentTyre.lastInspection ? formatDate(currentTyre.lastInspection) : 'Not yet inspected'}
                  muted={!currentTyre.lastInspection}
                />
                <DetailCell
                  icon={<CircleDot className="h-3.5 w-3.5" />}
                  label="Condition"
                  value={conditionMeta?.label || currentTyre.condition}
                />
                {fullTyre?.createdAt && (
                  <DetailCell
                    icon={<Clock className="h-3.5 w-3.5" />}
                    label="Created"
                    value={formatDateTime(fullTyre.createdAt)}
                  />
                )}
                {fullTyre?.updatedAt && (
                  <DetailCell
                    icon={<Clock className="h-3.5 w-3.5" />}
                    label="Last Updated"
                    value={formatDateTime(fullTyre.updatedAt)}
                  />
                )}
              </div>
            </div>

            {/* Notes */}
            {currentTyre.notes && (
              <div className="mx-5 sm:mx-6 mt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Notes</p>
                <div className="rounded-lg bg-muted/50 border p-3">
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{currentTyre.notes}</p>
                </div>
              </div>
            )}

            {/* Condition Lifecycle */}
            <div className="mx-5 sm:mx-6 mt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Condition Lifecycle</p>
                {canWrite && !isRetired && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs gap-1 text-primary hover:text-primary"
                    onClick={() => setConditionDialogOpen(true)}
                  >
                    <ArrowRightCircle className="h-3 w-3" />
                    Update
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-0">
                {CONDITION_ORDER.map((key, idx) => {
                  const meta = TYRE_CONDITIONS[key as keyof typeof TYRE_CONDITIONS]
                  const isActive = key === currentTyre.condition
                  const currentIdx = CONDITION_ORDER.indexOf(currentTyre.condition as typeof CONDITION_ORDER[number])
                  const thisIdx = CONDITION_ORDER.indexOf(key)
                  const isCompleted = thisIdx < currentIdx
                  const isRetiredState = key === 'replaced' && isRetired

                  return (
                    <div key={key} className="flex items-center flex-shrink-0">
                      <div className="flex flex-col items-center gap-0.5">
                        <div
                          className={cn(
                            'w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold transition-all',
                            isRetiredState
                              ? 'bg-orange-500 text-white ring-2 ring-orange-200 dark:ring-orange-800'
                              : isActive
                                ? 'bg-amber-500 text-white ring-2 ring-amber-200 dark:ring-amber-800'
                                : isCompleted
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {isCompleted ? '✓' : ''}
                        </div>
                        <span className={cn(
                          'text-[8px] leading-none',
                          isActive ? 'font-bold text-foreground' : 'text-muted-foreground'
                        )}>
                          {meta?.label || key}
                        </span>
                      </div>
                      {idx < CONDITION_ORDER.length - 1 && (
                        <div className={cn(
                          'w-2 sm:w-3 h-0.5 mb-3',
                          isCompleted
                            ? 'bg-emerald-500'
                            : isActive
                              ? 'bg-amber-300 dark:bg-amber-700'
                              : 'bg-border'
                        )} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Condition History */}
            {currentTyre.notes && currentTyre.condition !== 'new' && (
              <div className="mx-5 sm:mx-6 mt-1">
                <p className="text-[10px] text-muted-foreground">
                  Current condition since purchase · Tap &quot;Update&quot; to record changes
                </p>
              </div>
            )}

            {/* Action Buttons */}
            {canWrite && (
              <div className="mx-5 sm:mx-6 mt-5 space-y-2">
                {!isRetired && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setConditionDialogOpen(true)}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Change Condition
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => onEdit?.(currentTyre)}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Tyre
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Tyre
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this tyre?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the tyre record with serial number{' '}
                        <span className="font-mono font-semibold">{currentTyre.serialNumber}</span>.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={deleting}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {deleting ? 'Deleting...' : 'Delete Tyre'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </motion.div>
        )}

        {/* Change Condition Dialog */}
        <ChangeConditionDialog
          tyreId={tyre?.id || ''}
          currentCondition={currentTyre.condition}
          serialNumber={currentTyre.serialNumber}
          open={conditionDialogOpen}
          onOpenChange={setConditionDialogOpen}
          onChanged={handleConditionChanged}
        />
      </SheetContent>
    </Sheet>
  )
}

// ─── Change Condition Dialog ────────────────────────────────────────

function ChangeConditionDialog({
  tyreId,
  currentCondition,
  serialNumber,
  open,
  onOpenChange,
  onChanged,
}: {
  tyreId: string
  currentCondition: string
  serialNumber: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [selectedCondition, setSelectedCondition] = React.useState(currentCondition)
  const [reason, setReason] = React.useState('')
  const [inspectionDate, setInspectionDate] = React.useState(
    new Date().toISOString().split('T')[0]
  )
  const [updateInspection, setUpdateInspection] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)

  // Reset when dialog opens
  React.useEffect(() => {
    if (open) {
      setSelectedCondition(currentCondition)
      setReason('')
      setInspectionDate(new Date().toISOString().split('T')[0])
      setUpdateInspection(true)
    }
  }, [open, currentCondition])

  const isRetiring = RETIRING_CONDITIONS.has(selectedCondition)
  const isUnchanged = selectedCondition === currentCondition

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isUnchanged) {
      toast.info('Condition is already set to ' + (TYRE_CONDITIONS[selectedCondition as keyof typeof TYRE_CONDITIONS]?.label || selectedCondition))
      return
    }

    if (isRetiring && !reason.trim()) {
      toast.error('Please provide a reason for retiring this tyre')
      return
    }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        condition: selectedCondition,
      }

      // Set retired fields when retiring
      if (isRetiring) {
        body.retiredDate = new Date().toISOString()
        body.retiredReason = reason.trim()
      } else {
        // Clear retired fields if un-retiring
        body.retiredDate = null
        body.retiredReason = ''
      }

      // Optionally update inspection date
      if (updateInspection && inspectionDate) {
        body.lastInspection = inspectionDate
      }

      await apiFetch(`/api/tyres/${tyreId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })

      const newLabel = TYRE_CONDITIONS[selectedCondition as keyof typeof TYRE_CONDITIONS]?.label || selectedCondition
      const oldLabel = TYRE_CONDITIONS[currentCondition as keyof typeof TYRE_CONDITIONS]?.label || currentCondition

      toast.success(`Condition updated: ${oldLabel} → ${newLabel}`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update condition')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-amber-500" />
            Change Tyre Condition
          </DialogTitle>
          <DialogDescription>
            Update condition for <span className="font-mono font-semibold">{serialNumber}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <DialogBody className="space-y-4">
            {/* Current condition */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Current:</span>
              <Badge className={cn('border-transparent', TYRE_CONDITIONS[currentCondition as keyof typeof TYRE_CONDITIONS]?.color)}>
                {TYRE_CONDITIONS[currentCondition as keyof typeof TYRE_CONDITIONS]?.label || currentCondition}
              </Badge>
            </div>

            {/* Condition selector - lifecycle stages */}
            <div className="space-y-2">
              <Label>Select New Condition</Label>
              <div className="grid grid-cols-3 gap-2">
                {CONDITION_ORDER.map((key) => {
                  const meta = TYRE_CONDITIONS[key as keyof typeof TYRE_CONDITIONS]
                  const isSelected = key === selectedCondition
                  const isCurrent = key === currentCondition
                  const currentIdx = CONDITION_ORDER.indexOf(currentCondition as typeof CONDITION_ORDER[number])
                  const thisIdx = CONDITION_ORDER.indexOf(key)
                  const isPast = thisIdx < currentIdx

                  return (
                    <button
                      type="button"
                      key={key}
                      disabled={isPast}
                      className={cn(
                        'relative flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-all',
                        isPast && 'opacity-40 cursor-not-allowed border-muted bg-muted/30',
                        isSelected && !isPast && 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20',
                        !isSelected && !isPast && 'border-border hover:border-primary/50 hover:bg-muted/50 cursor-pointer'
                      )}
                      onClick={() => !isPast && setSelectedCondition(key)}
                    >
                      {/* Checkmark for past conditions */}
                      {isPast && (
                        <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center">
                          <span className="text-white text-[8px] font-bold">✓</span>
                        </div>
                      )}
                      {/* Radio indicator for selected */}
                      {!isPast && isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center">
                          <span className="text-primary-foreground text-[8px] font-bold">✓</span>
                        </div>
                      )}
                      <span className={cn(
                        'text-xs font-semibold',
                        isPast && 'text-muted-foreground line-through',
                        isSelected && 'text-primary',
                        !isSelected && !isPast && 'text-foreground'
                      )}>
                        {meta?.label || key}
                      </span>
                      <span className={cn(
                        'text-[9px] px-1.5 py-0.5 rounded-full',
                        meta?.color || 'bg-muted text-muted-foreground'
                      )}>
                        {key}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Past conditions (greyed out) cannot be re-selected. The lifecycle only moves forward.
              </p>
            </div>

            {/* Reason (required for retiring) */}
            {isRetiring && (
              <div className="space-y-2">
                <Label>
                  Retirement Reason <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  placeholder="e.g., Sidewall damage beyond repair, tread worn to minimum depth..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="min-h-[80px] text-sm"
                />
              </div>
            )}

            {/* Optional: Update inspection date */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="update-inspection"
                  checked={updateInspection}
                  onChange={(e) => setUpdateInspection(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="update-inspection" className="text-sm font-normal cursor-pointer">
                  Update last inspection date
                </Label>
              </div>
              {updateInspection && (
                <DatePicker value={inspectionDate} onChange={(val) => setInspectionDate(val)} />
              )}
            </div>

            {/* Summary */}
            {!isUnchanged && (
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Summary</p>
                <div className="flex items-center gap-2 text-sm">
                  <Badge className={cn('border-transparent', TYRE_CONDITIONS[currentCondition as keyof typeof TYRE_CONDITIONS]?.color)}>
                    {TYRE_CONDITIONS[currentCondition as keyof typeof TYRE_CONDITIONS]?.label || currentCondition}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge className={cn('border-transparent', TYRE_CONDITIONS[selectedCondition as keyof typeof TYRE_CONDITIONS]?.color)}>
                    {TYRE_CONDITIONS[selectedCondition as keyof typeof TYRE_CONDITIONS]?.label || selectedCondition}
                  </Badge>
                </div>
                {isRetiring && (
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                    ⚠ This will mark the tyre as retired with today&apos;s date.
                  </p>
                )}
              </div>
            )}
          </DialogBody>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || isUnchanged}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : isRetiring ? (
                'Retire Tyre'
              ) : (
                'Update Condition'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Detail Cell ────────────────────────────────────────────────────

function DetailCell({
  icon,
  label,
  value,
  sub,
  mono,
  muted,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  mono?: boolean
  muted?: boolean
}) {
  return (
    <div className="p-3 border-b border-r last:border-b-0 border-border/60 even:border-r-0">
      <div className="flex items-start gap-2">
        <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-tight">{label}</p>
          <p className={cn(
            'text-xs font-semibold mt-0.5 leading-snug',
            mono && 'font-mono',
            muted && 'text-muted-foreground italic font-normal'
          )}>
            {value}
          </p>
          {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  )
}
