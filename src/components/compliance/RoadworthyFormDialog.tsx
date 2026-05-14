'use client'

import React, { useState, useEffect } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Loader2, ShieldCheck } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'

// ─── Exported Types ───────────────────────────────────────────────────────
export interface RoadworthyInspection {
  id: string
  truckId: string
  certificateNumber: string
  inspectionType: string
  inspectionDate: string
  inspectionStation?: string | null
  inspectorName?: string | null
  inspectorId?: string | null
  result: string
  vehicleFitness?: string | null
  brakesCheck?: string | null
  lightsCheck?: string | null
  tyresCheck?: string | null
  emissionsCheck?: string | null
  steeringCheck?: string | null
  suspensionCheck?: string | null
  bodyCheck?: string | null
  electricalCheck?: string | null
  odometerReading?: number | null
  defectsFound?: string | null
  advisories?: string | null
  recommendations?: string | null
  certificateIssued?: boolean | null
  certificateExpiry?: string | null
  inspectionFee?: number | null
  nextInspectionDue?: string | null
  status: string
  truck: { id: string; plateNumber: string; make: string; model: string }
}

// ─── Props ────────────────────────────────────────────────────────────────
interface RoadworthyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  inspection?: RoadworthyInspection | null
  onSuccess: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────
const INSPECTION_TYPE_OPTIONS = [
  { value: 'annual', label: 'Annual Inspection' },
  { value: 'quarterly', label: 'Quarterly Check' },
  { value: 'special', label: 'Special Inspection' },
  { value: 'pre_trip', label: 'Pre-Trip Inspection' },
  { value: 'transfer', label: 'Transfer Inspection' },
]

const RESULT_OPTIONS = [
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'conditional_pass', label: 'Conditional Pass' },
  { value: 'pending', label: 'Pending' },
]

const FITNESS_OPTIONS = [
  { value: 'fit', label: 'Fit for Road Use' },
  { value: 'conditional', label: 'Conditionally Fit' },
  { value: 'unfit', label: 'Unfit for Road Use' },
]

const CHECK_OPTIONS = [
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'advisory', label: 'Advisory' },
]

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'voided', label: 'Voided' },
]

interface TruckOption {
  id: string
  plateNumber: string
  make: string
  model: string
}

// ─── Component ────────────────────────────────────────────────────────────
export function RoadworthyFormDialog({ open, onOpenChange, inspection, onSuccess }: RoadworthyFormDialogProps) {
  const isEditing = !!inspection
  const [submitting, setSubmitting] = useState(false)
  const [trucks, setTrucks] = useState<TruckOption[]>([])
  const [loadingTrucks, setLoadingTrucks] = useState(false)

  // Form fields
  const [truckId, setTruckId] = useState('')
  const [certificateNumber, setCertificateNumber] = useState('')
  const [inspectionType, setInspectionType] = useState('')
  const [inspectionDate, setInspectionDate] = useState('')
  const [result, setResult] = useState('')
  const [inspectionStation, setInspectionStation] = useState('')
  const [inspectorName, setInspectorName] = useState('')
  const [inspectorId, setInspectorId] = useState('')

  // Safety checks
  const [brakesCheck, setBrakesCheck] = useState('')
  const [lightsCheck, setLightsCheck] = useState('')
  const [tyresCheck, setTyresCheck] = useState('')
  const [emissionsCheck, setEmissionsCheck] = useState('')
  const [steeringCheck, setSteeringCheck] = useState('')
  const [suspensionCheck, setSuspensionCheck] = useState('')
  const [bodyCheck, setBodyCheck] = useState('')
  const [electricalCheck, setElectricalCheck] = useState('')

  // Vehicle fitness & result
  const [vehicleFitness, setVehicleFitness] = useState('')
  const [odometerReading, setOdometerReading] = useState('')

  // Certificate & scheduling
  const [certificateIssued, setCertificateIssued] = useState(false)
  const [certificateExpiry, setCertificateExpiry] = useState('')
  const [nextInspectionDue, setNextInspectionDue] = useState('')
  const [inspectionFee, setInspectionFee] = useState('')

  // Notes
  const [defectsFound, setDefectsFound] = useState('')
  const [advisories, setAdvisories] = useState('')
  const [recommendations, setRecommendations] = useState('')
  const [status, setStatus] = useState('completed')

  // ─── Load trucks ──────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setLoadingTrucks(true)
      apiFetch<{ data: TruckOption[] }>('/api/trucks?limit=100&status=active')
        .then((res) => setTrucks(res.data || []))
        .catch(() => toast.error('Failed to load trucks'))
        .finally(() => setLoadingTrucks(false))
    }
  }, [open])

  // ─── Pre-fill form when editing ───────────────────────────────────────
  useEffect(() => {
    if (inspection && open) {
      setTruckId(inspection.truckId)
      setCertificateNumber(inspection.certificateNumber)
      setInspectionType(inspection.inspectionType)
      setInspectionDate(inspection.inspectionDate ? new Date(inspection.inspectionDate).toISOString().split('T')[0] : '')
      setResult(inspection.result)
      setInspectionStation(inspection.inspectionStation || '')
      setInspectorName(inspection.inspectorName || '')
      setInspectorId(inspection.inspectorId || '')
      setBrakesCheck(inspection.brakesCheck || '')
      setLightsCheck(inspection.lightsCheck || '')
      setTyresCheck(inspection.tyresCheck || '')
      setEmissionsCheck(inspection.emissionsCheck || '')
      setSteeringCheck(inspection.steeringCheck || '')
      setSuspensionCheck(inspection.suspensionCheck || '')
      setBodyCheck(inspection.bodyCheck || '')
      setElectricalCheck(inspection.electricalCheck || '')
      setVehicleFitness(inspection.vehicleFitness || '')
      setOdometerReading(inspection.odometerReading ? String(inspection.odometerReading) : '')
      setCertificateIssued(inspection.certificateIssued || false)
      setCertificateExpiry(inspection.certificateExpiry ? new Date(inspection.certificateExpiry).toISOString().split('T')[0] : '')
      setNextInspectionDue(inspection.nextInspectionDue ? new Date(inspection.nextInspectionDue).toISOString().split('T')[0] : '')
      setInspectionFee(inspection.inspectionFee ? String(inspection.inspectionFee) : '')
      setDefectsFound(inspection.defectsFound || '')
      setAdvisories(inspection.advisories || '')
      setRecommendations(inspection.recommendations || '')
      setStatus(inspection.status || 'completed')
    } else if (!inspection && open) {
      resetForm()
    }
  }, [inspection, open])

  function resetForm() {
    setTruckId('')
    setCertificateNumber('')
    setInspectionType('')
    setInspectionDate('')
    setResult('')
    setInspectionStation('')
    setInspectorName('')
    setInspectorId('')
    setBrakesCheck('')
    setLightsCheck('')
    setTyresCheck('')
    setEmissionsCheck('')
    setSteeringCheck('')
    setSuspensionCheck('')
    setBodyCheck('')
    setElectricalCheck('')
    setVehicleFitness('')
    setOdometerReading('')
    setCertificateIssued(false)
    setCertificateExpiry('')
    setNextInspectionDue('')
    setInspectionFee('')
    setDefectsFound('')
    setAdvisories('')
    setRecommendations('')
    setStatus('completed')
  }

  const truckOptions: SearchableOption[] = [
    ...(trucks || []).map((t): SearchableOption => ({
      value: t.id,
      label: `${t.plateNumber} — ${t.make} ${t.model}`,
    })),
  ]

  // ─── Submit handler ───────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!truckId) { toast.error('Please select a truck'); return }
    if (!certificateNumber.trim()) { toast.error('Certificate number is required'); return }
    if (!inspectionType) { toast.error('Inspection type is required'); return }
    if (!inspectionDate) { toast.error('Inspection date is required'); return }
    if (!result) { toast.error('Inspection result is required'); return }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        truckId,
        certificateNumber: certificateNumber.trim(),
        inspectionType,
        inspectionDate,
        result,
        status,
      }

      // Inspector details
      if (inspectionStation.trim()) body.inspectionStation = inspectionStation.trim()
      if (inspectorName.trim()) body.inspectorName = inspectorName.trim()
      if (inspectorId.trim()) body.inspectorId = inspectorId.trim()

      // Safety checks
      if (brakesCheck) body.brakesCheck = brakesCheck
      if (lightsCheck) body.lightsCheck = lightsCheck
      if (tyresCheck) body.tyresCheck = tyresCheck
      if (emissionsCheck) body.emissionsCheck = emissionsCheck
      if (steeringCheck) body.steeringCheck = steeringCheck
      if (suspensionCheck) body.suspensionCheck = suspensionCheck
      if (bodyCheck) body.bodyCheck = bodyCheck
      if (electricalCheck) body.electricalCheck = electricalCheck

      // Vehicle fitness & odometer
      if (vehicleFitness) body.vehicleFitness = vehicleFitness
      if (odometerReading) body.odometerReading = parseFloat(odometerReading)

      // Certificate & scheduling
      body.certificateIssued = certificateIssued
      if (certificateExpiry) body.certificateExpiry = certificateExpiry
      if (nextInspectionDue) body.nextInspectionDue = nextInspectionDue
      if (inspectionFee) body.inspectionFee = parseFloat(inspectionFee)

      // Notes
      if (defectsFound.trim()) body.defectsFound = defectsFound.trim()
      if (advisories.trim()) body.advisories = advisories.trim()
      if (recommendations.trim()) body.recommendations = recommendations.trim()

      const url = isEditing ? `/api/roadworthy-inspections/${inspection!.id}` : '/api/roadworthy-inspections'
      const method = isEditing ? 'PUT' : 'POST'

      const res = await apiFetch<{ success: boolean }>(url, {
        method,
        body: JSON.stringify(body),
      })

      if (!res) throw new Error('Operation failed')

      toast.success(isEditing ? 'Roadworthy inspection updated successfully' : 'Roadworthy inspection added successfully')
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save roadworthy inspection')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Helper: check result color ───────────────────────────────────────
  function getCheckColor(value: string) {
    switch (value) {
      case 'pass': return 'text-emerald-600'
      case 'fail': return 'text-red-600'
      case 'advisory': return 'text-amber-600'
      default: return ''
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {isEditing ? 'Edit Roadworthy Inspection' : 'Add New Roadworthy Inspection'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Update inspection record for certificate ${inspection?.certificateNumber}`
              : 'Record a new vehicle roadworthiness inspection'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <DialogBody className="space-y-5 flex-1">

            {/* ── Section: Truck & Inspection Info ── */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Inspection Details</h4>

              {/* Truck Selection (full width) */}
              <div className="space-y-2">
                <Label>Truck <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  placeholder={loadingTrucks ? 'Loading trucks...' : 'Select a truck'}
                  searchPlaceholder="Search trucks..."
                  emptyMessage="No trucks found"
                  value={truckId}
                  onValueChange={setTruckId}
                  options={truckOptions}
                  disabled={loadingTrucks || isEditing}
                />
              </div>

              {/* Certificate Number + Inspection Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cert-number">Certificate Number <span className="text-destructive">*</span></Label>
                  <Input
                    id="cert-number"
                    placeholder="e.g., RW-2024-00123"
                    value={certificateNumber}
                    onChange={(e) => setCertificateNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Inspection Type <span className="text-destructive">*</span></Label>
                  <Select value={inspectionType} onValueChange={setInspectionType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select inspection type" />
                    </SelectTrigger>
                    <SelectContent>
                      {INSPECTION_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Inspection Date + Result */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="insp-date">Inspection Date <span className="text-destructive">*</span></Label>
                  <Input
                    id="insp-date"
                    type="date"
                    value={inspectionDate}
                    onChange={(e) => setInspectionDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Result <span className="text-destructive">*</span></Label>
                  <Select value={result} onValueChange={setResult}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select result" />
                    </SelectTrigger>
                    <SelectContent>
                      {RESULT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Vehicle Fitness + Odometer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vehicle Fitness</Label>
                  <Select value={vehicleFitness} onValueChange={setVehicleFitness}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select fitness rating" />
                    </SelectTrigger>
                    <SelectContent>
                      {FITNESS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="odometer">Odometer Reading (km)</Label>
                  <Input
                    id="odometer"
                    type="number"
                    step="1"
                    min="0"
                    placeholder="e.g., 150000"
                    value={odometerReading}
                    onChange={(e) => setOdometerReading(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* ── Section: Inspector & Station ── */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Inspector Information</h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="inspector-name">Inspector Name</Label>
                  <Input
                    id="inspector-name"
                    placeholder="e.g., Kofi Mensah"
                    value={inspectorName}
                    onChange={(e) => setInspectorName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inspector-id">Inspector ID</Label>
                  <Input
                    id="inspector-id"
                    placeholder="e.g., DVLA-INS-001"
                    value={inspectorId}
                    onChange={(e) => setInspectorId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="station">Inspection Station</Label>
                  <Input
                    id="station"
                    placeholder="e.g., DVLA Testing Centre, Accra"
                    value={inspectionStation}
                    onChange={(e) => setInspectionStation(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* ── Section: Safety Checks Grid ── */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Safety Checks</h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Brakes', value: brakesCheck, setter: setBrakesCheck },
                  { label: 'Lights', value: lightsCheck, setter: setLightsCheck },
                  { label: 'Tyres', value: tyresCheck, setter: setTyresCheck },
                  { label: 'Emissions', value: emissionsCheck, setter: setEmissionsCheck },
                  { label: 'Steering', value: steeringCheck, setter: setSteeringCheck },
                  { label: 'Suspension', value: suspensionCheck, setter: setSuspensionCheck },
                  { label: 'Body', value: bodyCheck, setter: setBodyCheck },
                  { label: 'Electrical', value: electricalCheck, setter: setElectricalCheck },
                ].map((check) => (
                  <div key={check.label} className="space-y-2">
                    <Label className="text-xs">{check.label}</Label>
                    <Select value={check.value} onValueChange={check.setter}>
                      <SelectTrigger className={check.value ? getCheckColor(check.value) : ''}>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {CHECK_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* ── Section: Certificate & Scheduling ── */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Certificate & Scheduling</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cert-expiry">Certificate Expiry Date</Label>
                  <Input
                    id="cert-expiry"
                    type="date"
                    value={certificateExpiry}
                    onChange={(e) => setCertificateExpiry(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="next-insp">Next Inspection Due</Label>
                  <Input
                    id="next-insp"
                    type="date"
                    value={nextInspectionDue}
                    onChange={(e) => setNextInspectionDue(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="insp-fee">Inspection Fee (GHS)</Label>
                  <Input
                    id="insp-fee"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={inspectionFee}
                    onChange={(e) => setInspectionFee(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Certificate Issued Toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${certificateIssued ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                  onClick={() => setCertificateIssued(!certificateIssued)}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${certificateIssued ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <Label className="cursor-pointer" onClick={() => setCertificateIssued(!certificateIssued)}>
                  Certificate Issued
                </Label>
              </div>
            </div>

            <Separator />

            {/* ── Section: Defects & Recommendations ── */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Defects & Recommendations</h4>

              <div className="space-y-2">
                <Label htmlFor="defects">Defects Found</Label>
                <Textarea
                  id="defects"
                  placeholder="List any defects found during inspection..."
                  value={defectsFound}
                  onChange={(e) => setDefectsFound(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="advisories">Advisories</Label>
                  <Textarea
                    id="advisories"
                    placeholder="Any advisory items noted..."
                    value={advisories}
                    onChange={(e) => setAdvisories(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recommendations">Recommendations</Label>
                  <Textarea
                    id="recommendations"
                    placeholder="Repair or maintenance recommendations..."
                    value={recommendations}
                    onChange={(e) => setRecommendations(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            </div>

          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : isEditing ? (
                'Update Inspection'
              ) : (
                'Add Inspection'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
