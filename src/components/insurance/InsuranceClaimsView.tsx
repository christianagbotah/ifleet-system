'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Search, ShieldAlert, AlertCircle, RefreshCw, Eye, Trash2,
  ChevronRight, CalendarDays, MapPin, FileText, User, DollarSign,
  Building2, Truck, Clock, CheckCircle2, XCircle, Send, ClipboardCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { useDebounce } from '@/hooks/use-debounce'
import {
  fetchInsuranceClaims, createInsuranceClaim, updateInsuranceClaim, deleteInsuranceClaim,
  fetchTrucks, fetchInsurance,
  type InsuranceClaim, type Truck, type InsurancePolicy,
} from '@/lib/api'
import { toast } from 'sonner'

// ─── Status & Type Maps ──────────────────────────────────────────────────────

const CLAIM_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:        { label: 'Draft',        color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  submitted:    { label: 'Submitted',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  under_review: { label: 'Under Review', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  approved:     { label: 'Approved',     color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  rejected:     { label: 'Rejected',     color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  paid:         { label: 'Paid',         color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  closed:       { label: 'Closed',       color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500' },
}

const CLAIM_TYPE_MAP: Record<string, { label: string; color: string }> = {
  accident:      { label: 'Accident',      color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  theft:         { label: 'Theft',         color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  fire:          { label: 'Fire',          color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  third_party:   { label: 'Third Party',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  comprehensive: { label: 'Comprehensive', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  windshield:    { label: 'Windshield',    color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
}

const CLAIM_TYPES = Object.keys(CLAIM_TYPE_MAP) as string[]

function ClaimStatusBadge({ status }: { status: string }) {
  const cfg = CLAIM_STATUS_MAP[status]
  if (!cfg) return <Badge variant="outline">{status.replace(/_/g, ' ')}</Badge>
  return <Badge variant="outline" className={`border-transparent font-medium ${cfg.color}`}>{cfg.label}</Badge>
}

function ClaimTypeBadge({ type }: { type: string }) {
  const cfg = CLAIM_TYPE_MAP[type]
  if (!cfg) return <Badge variant="secondary">{type.replace(/_/g, ' ')}</Badge>
  return <Badge variant="secondary" className={cfg.color}>{cfg.label}</Badge>
}

// ─── Status Workflow ─────────────────────────────────────────────────────────

const NEXT_STATUS_OPTIONS: Record<string, { value: string; label: string; icon: React.ReactNode }[]> = {
  draft: [
    { value: 'submitted', label: 'Submit', icon: <Send className="h-3.5 w-3.5" /> },
  ],
  submitted: [
    { value: 'under_review', label: 'Start Review', icon: <Eye className="h-3.5 w-3.5" /> },
  ],
  under_review: [
    { value: 'approved', label: 'Approve', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    { value: 'rejected', label: 'Reject', icon: <XCircle className="h-3.5 w-3.5" /> },
  ],
  approved: [
    { value: 'paid', label: 'Mark Paid', icon: <DollarSign className="h-3.5 w-3.5" /> },
  ],
  paid: [
    { value: 'closed', label: 'Close', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  ],
  rejected: [
    { value: 'draft', label: 'Re-draft', icon: <ClipboardCheck className="h-3.5 w-3.5" /> },
  ],
}

// ─── Animation variants ──────────────────────────────────────────────────────

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}
const itemVariants = {
  show: { opacity: 1, y: 0 },
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function InsuranceClaimsView() {
  const [search, setSearch] = React.useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeTab, setActiveTab] = React.useState('all')
  const [records, setRecords] = React.useState<InsuranceClaim[]>([])
  const [summary, setSummary] = React.useState({ openCount: 0, reviewCount: 0, totalClaimed: 0, totalApproved: 0 })
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Create dialog
  const [createOpen, setCreateOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [createTrucks, setCreateTrucks] = React.useState<Truck[]>([])
  const [createPolicies, setCreatePolicies] = React.useState<InsurancePolicy[]>([])
  const [createForm, setCreateForm] = React.useState({
    insuranceId: '', truckId: '', claimType: '', incidentDate: '',
    incidentLocation: '', description: '', claimAmount: '',
    deductible: '', policeReport: '', repairEstimate: '',
  })

  // Detail sheet
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [detailClaim, setDetailClaim] = React.useState<InsuranceClaim | null>(null)
  const [statusTransitioning, setStatusTransitioning] = React.useState(false)

  const loadRecords = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Parameters<typeof fetchInsuranceClaims>[0] = { limit: 100 }
      if (activeTab !== 'all') params.status = activeTab
      const result = await fetchInsuranceClaims(params)
      setRecords(result.data)
      if (result.summary) setSummary(result.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch insurance claims')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  React.useEffect(() => { loadRecords() }, [loadRecords])

  const filteredRecords = React.useMemo(() => {
    if (!debouncedSearch) return records
    const q = debouncedSearch.toLowerCase()
    return records.filter((r) =>
      r.claimNumber.toLowerCase().includes(q) ||
      r.truck.plateNumber.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.incidentLocation.toLowerCase().includes(q)
    )
  }, [records, debouncedSearch])

  // Create handlers
  const loadCreateData = React.useCallback(async () => {
    try {
      const [trucksRes, policiesRes] = await Promise.all([
        fetchTrucks({ limit: 200 }),
        fetchInsurance({ status: 'active', limit: 200 }),
      ])
      setCreateTrucks(trucksRes.data)
      setCreatePolicies(policiesRes.data)
    } catch { /* ignore */ }
  }, [])

  const handleCreateOpen = () => {
    setCreateForm({
      insuranceId: '', truckId: '', claimType: '', incidentDate: '',
      incidentLocation: '', description: '', claimAmount: '',
      deductible: '', policeReport: '', repairEstimate: '',
    })
    setCreateOpen(true)
    loadCreateData()
  }

  const handleCreateSubmit = async () => {
    if (!createForm.insuranceId || !createForm.truckId || !createForm.claimType ||
        !createForm.incidentDate || !createForm.incidentLocation || !createForm.claimAmount) {
      toast.error('Please fill in all required fields')
      return
    }
    setCreating(true)
    try {
      await createInsuranceClaim({
        insuranceId: createForm.insuranceId,
        truckId: createForm.truckId,
        claimType: createForm.claimType,
        incidentDate: createForm.incidentDate,
        incidentLocation: createForm.incidentLocation,
        description: createForm.description,
        claimAmount: parseFloat(createForm.claimAmount),
        deductible: createForm.deductible ? parseFloat(createForm.deductible) : null,
        policeReport: createForm.policeReport || null,
        repairEstimate: createForm.repairEstimate ? parseFloat(createForm.repairEstimate) : null,
      })
      toast.success('Insurance claim created')
      setCreateOpen(false)
      loadRecords()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create claim')
    } finally {
      setCreating(false)
    }
  }

  // Detail & status transition
  const handleViewDetail = (claim: InsuranceClaim) => {
    setDetailClaim(claim)
    setDetailOpen(true)
  }

  const handleStatusTransition = async (claim: InsuranceClaim, newStatus: string) => {
    setStatusTransitioning(true)
    try {
      const data: Record<string, unknown> = { status: newStatus }
      if (newStatus === 'approved' && claim.claimAmount) {
        data.approvedAmount = claim.claimAmount
      }
      const updated = await updateInsuranceClaim(claim.id, data)
      toast.success(`Claim status updated to ${newStatus.replace(/_/g, ' ')}`)
      setDetailClaim(updated)
      loadRecords()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setStatusTransitioning(false)
    }
  }

  const handleDelete = async (claim: InsuranceClaim) => {
    if (claim.status !== 'draft') {
      toast.error('Only draft claims can be deleted')
      return
    }
    try {
      await deleteInsuranceClaim(claim.id)
      toast.success('Claim deleted')
      setDetailOpen(false)
      loadRecords()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete claim')
    }
  }

  return (
    <motion.div variants={containerVariants} animate="show" className="space-y-4 sm:space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Insurance Claims</h1>
          <p className="text-muted-foreground">Manage insurance claims and track claim status</p>
        </div>
        <Button onClick={handleCreateOpen} className="bg-emerald-500 hover:bg-emerald-600 text-white">
          <Plus className="mr-2 h-4 w-4" />
          New Claim
        </Button>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-3 w-16 mb-2" /><Skeleton className="h-6 w-10" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Active Claims</p>
                <p className="text-xl font-bold text-amber-600">{summary.openCount + summary.reviewCount}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Claimed</p>
                <p className="text-xl font-bold">{CURRENCY_SYMBOL}{summary.totalClaimed.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Approved Amount</p>
                <p className="text-xl font-bold text-emerald-600">{CURRENCY_SYMBOL}{summary.totalApproved.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Pending Review</p>
                <p className="text-xl font-bold text-blue-600">{summary.reviewCount}</p>
              </CardContent>
            </Card>
          </>
        )}
      </motion.div>

      {/* Search & Tabs */}
      <motion.div variants={itemVariants} className="space-y-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by claim #, truck, location..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full sm:w-auto flex-wrap">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="draft">Draft</TabsTrigger>
            <TabsTrigger value="submitted">Submitted</TabsTrigger>
            <TabsTrigger value="under_review">Under Review</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="paid">Paid</TabsTrigger>
            <TabsTrigger value="closed">Closed</TabsTrigger>
          </TabsList>

          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center mt-4">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadRecords}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="mt-4 p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : (
            <TabsContent value={activeTab} className="mt-4">
              <ClaimsTable
                records={filteredRecords}
                onView={handleViewDetail}
              />
            </TabsContent>
          )}
        </Tabs>
      </motion.div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>File New Insurance Claim</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-4 py-2">
            {/* Insurance Policy */}
            <div className="space-y-2">
              <Label>Insurance Policy *</Label>
              <Select value={createForm.insuranceId} onValueChange={(v) => setCreateForm((p) => ({ ...p, insuranceId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select policy" /></SelectTrigger>
                <SelectContent>
                  {createPolicies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.provider} — {p.policyNumber} ({p.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Truck */}
            <div className="space-y-2">
              <Label>Truck *</Label>
              <Select value={createForm.truckId} onValueChange={(v) => setCreateForm((p) => ({ ...p, truckId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select truck" /></SelectTrigger>
                <SelectContent>
                  {createTrucks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.plateNumber} — {t.make} {t.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Claim Type */}
            <div className="space-y-2">
              <Label>Claim Type *</Label>
              <Select value={createForm.claimType} onValueChange={(v) => setCreateForm((p) => ({ ...p, claimType: v }))}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {CLAIM_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{CLAIM_TYPE_MAP[t]?.label || t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Incident Date & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Incident Date *</Label>
                <Input
                  type="date"
                  value={createForm.incidentDate}
                  onChange={(e) => setCreateForm((p) => ({ ...p, incidentDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Claim Amount ({CURRENCY_SYMBOL}) *</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={createForm.claimAmount}
                  onChange={(e) => setCreateForm((p) => ({ ...p, claimAmount: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Incident Location *</Label>
              <Input
                placeholder="e.g. Accra-Tema Highway near Ashaiman"
                value={createForm.incidentLocation}
                onChange={(e) => setCreateForm((p) => ({ ...p, incidentLocation: e.target.value }))}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Describe the incident..."
                value={createForm.description}
                onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Deductible & Repair Estimate */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Deductible ({CURRENCY_SYMBOL})</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={createForm.deductible}
                  onChange={(e) => setCreateForm((p) => ({ ...p, deductible: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Repair Estimate ({CURRENCY_SYMBOL})</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={createForm.repairEstimate}
                  onChange={(e) => setCreateForm((p) => ({ ...p, repairEstimate: e.target.value }))}
                />
              </div>
            </div>

            {/* Police Report */}
            <div className="space-y-2">
              <Label>Police Report #</Label>
              <Input
                placeholder="Police report reference number"
                value={createForm.policeReport}
                onChange={(e) => setCreateForm((p) => ({ ...p, policeReport: e.target.value }))}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSubmit} disabled={creating} className="bg-emerald-500 hover:bg-emerald-600 text-white">
              {creating ? 'Creating...' : 'Create Claim'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="sm:max-w-lg">
          {detailClaim && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <SheetTitle className="flex-1">Claim {detailClaim.claimNumber}</SheetTitle>
                  <ClaimStatusBadge status={detailClaim.status} />
                </div>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Claim Type & Truck */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Claim Type</p>
                    <ClaimTypeBadge type={detailClaim.claimType} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Truck</p>
                    <p className="text-sm font-medium flex items-center gap-1">
                      <Truck className="h-3.5 w-3.5" />
                      {detailClaim.truck.plateNumber}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Incident Details */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Incident Details</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p className="font-medium flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {new Date(detailClaim.incidentDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Location</p>
                      <p className="font-medium flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {detailClaim.incidentLocation}
                      </p>
                    </div>
                  </div>
                  {detailClaim.description && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Description</p>
                      <p className="text-sm bg-muted/50 rounded-md p-3">{detailClaim.description}</p>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Financials */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Financial Details</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Claim Amount</p>
                      <p className="text-lg font-bold">{CURRENCY_SYMBOL}{detailClaim.claimAmount.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Approved Amount</p>
                      <p className="text-lg font-bold text-emerald-600">
                        {detailClaim.approvedAmount ? `${CURRENCY_SYMBOL}${detailClaim.approvedAmount.toLocaleString()}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Deductible</p>
                      <p className="font-medium">
                        {detailClaim.deductible ? `${CURRENCY_SYMBOL}${detailClaim.deductible.toLocaleString()}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Repair Estimate</p>
                      <p className="font-medium">
                        {detailClaim.repairEstimate ? `${CURRENCY_SYMBOL}${detailClaim.repairEstimate.toLocaleString()}` : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Policy & Insurance */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Insurance Policy</h4>
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Provider:</span> <span className="font-medium">{detailClaim.insurance.provider}</span></p>
                    <p><span className="text-muted-foreground">Policy #:</span> <span className="font-medium">{detailClaim.insurance.policyNumber}</span></p>
                    <p><span className="text-muted-foreground">Type:</span> <span className="font-medium">{detailClaim.insurance.type}</span></p>
                  </div>
                </div>

                <Separator />

                {/* Documents & References */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Documents & References</h4>
                  <div className="text-sm space-y-1">
                    {detailClaim.policeReport ? (
                      <p><span className="text-muted-foreground">Police Report:</span> <span className="font-medium">{detailClaim.policeReport}</span></p>
                    ) : (
                      <p><span className="text-muted-foreground">Police Report:</span> <span className="text-xs">Not filed</span></p>
                    )}
                    {detailClaim.assignedAdjuster && (
                      <p><span className="text-muted-foreground">Adjuster:</span> <span className="font-medium">{detailClaim.assignedAdjuster}</span></p>
                    )}
                    {detailClaim.thirdPartyDetails && (
                      <div>
                        <p className="text-muted-foreground">Third Party Details:</p>
                        <p className="bg-muted/50 rounded-md p-2 mt-1">{detailClaim.thirdPartyDetails}</p>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Timeline */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Timeline</h4>
                  <div className="space-y-2">
                    <TimelineEntry label="Created" date={detailClaim.createdAt} active />
                    {detailClaim.submittedAt && (
                      <TimelineEntry label="Submitted" date={detailClaim.submittedAt} active={detailClaim.status !== 'draft'} />
                    )}
                    {detailClaim.reviewedAt && (
                      <TimelineEntry label="Reviewed" date={detailClaim.reviewedAt} active={['approved', 'rejected'].includes(detailClaim.status)} />
                    )}
                    {detailClaim.approvedAt && (
                      <TimelineEntry label="Approved" date={detailClaim.approvedAt} active={['approved', 'paid', 'closed'].includes(detailClaim.status)} />
                    )}
                    {detailClaim.paidAt && (
                      <TimelineEntry label="Paid" date={detailClaim.paidAt} active={['paid', 'closed'].includes(detailClaim.status)} />
                    )}
                  </div>
                </div>

                {/* Notes */}
                {(detailClaim.notes || detailClaim.assessorNotes) && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold">Notes</h4>
                      {detailClaim.notes && (
                        <div className="text-sm">
                          <p className="text-xs text-muted-foreground mb-1">Internal Notes</p>
                          <p className="bg-muted/50 rounded-md p-2">{detailClaim.notes}</p>
                        </div>
                      )}
                      {detailClaim.assessorNotes && (
                        <div className="text-sm">
                          <p className="text-xs text-muted-foreground mb-1">Assessor Notes</p>
                          <p className="bg-muted/50 rounded-md p-2">{detailClaim.assessorNotes}</p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                <Separator />

                {/* Actions */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Actions</h4>
                  <div className="flex flex-wrap gap-2">
                    {NEXT_STATUS_OPTIONS[detailClaim.status]?.map((opt) => (
                      <Button
                        key={opt.value}
                        size="sm"
                        disabled={statusTransitioning}
                        onClick={() => handleStatusTransition(detailClaim, opt.value)}
                        className={opt.value === 'rejected' ? 'bg-red-500 hover:bg-red-600 text-white' : ''}
                      >
                        {opt.icon}
                        <span className="ml-1.5">{opt.label}</span>
                      </Button>
                    ))}
                    {detailClaim.status === 'draft' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={() => handleDelete(detailClaim)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </motion.div>
  )
}

// ─── Claims Table (Desktop) / Cards (Mobile) ─────────────────────────────────

function ClaimsTable({ records, onView }: {
  records: InsuranceClaim[]
  onView: (claim: InsuranceClaim) => void
}) {
  if (records.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={ShieldAlert}
          title="No claims found"
          description="No insurance claims match your current filter. Try adjusting your search or create a new claim."
        />
      </div>
    )
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Truck</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden lg:table-cell">Incident Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((claim) => (
                <TableRow key={claim.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onView(claim)}>
                  <TableCell className="text-sm font-mono font-medium">{claim.claimNumber}</TableCell>
                  <TableCell><ClaimTypeBadge type={claim.claimType} /></TableCell>
                  <TableCell className="text-sm font-medium">{claim.truck.plateNumber}</TableCell>
                  <TableCell className="text-right text-sm font-semibold">
                    {CURRENCY_SYMBOL}{claim.claimAmount.toLocaleString()}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {new Date(claim.incidentDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell><ClaimStatusBadge status={claim.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="gap-1" onClick={(e) => { e.stopPropagation(); onView(claim) }}>
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden divide-y">
        {records.map((claim) => (
          <div key={claim.id} className="mobile-card p-4 space-y-2 cursor-pointer" onClick={() => onView(claim)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-mono font-semibold">{claim.claimNumber}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Truck className="h-3 w-3" />
                  {claim.truck.plateNumber} — {claim.truck.make} {claim.truck.model}
                </p>
              </div>
              <ClaimStatusBadge status={claim.status} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                <ClaimTypeBadge type={claim.claimType} />
              </div>
              <span className="text-sm font-bold">{CURRENCY_SYMBOL}{claim.claimAmount.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-xs text-muted-foreground">
                {new Date(claim.incidentDate).toLocaleDateString()}
              </span>
              <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs">
                View <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ─── Timeline Entry ──────────────────────────────────────────────────────────

function TimelineEntry({ label, date, active }: { label: string; date: string; active: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
      <div className="flex-1 flex items-center justify-between">
        <span className={`text-sm ${active ? 'font-medium' : 'text-muted-foreground'}`}>{label}</span>
        <span className="text-xs text-muted-foreground">
          {new Date(date).toLocaleDateString()} {new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}
