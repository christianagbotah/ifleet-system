'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { AlertTriangle, MapPin, Clock, Eye, CheckCircle, XCircle, Plus, Filter, Pencil, Trash2, RefreshCw } from 'lucide-react'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import {
  fetchRoadConditions,
  createRoadConditionReport,
  updateRoadConditionReport,
  deleteRoadConditionReport,
  type RoadConditionReport,
} from '@/lib/api'

const GHANA_REGIONS = [
  'Greater Accra', 'Ashanti', 'Western', 'Eastern', 'Central', 'Volta',
  'Northern', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo', 'Ahafo',
  'Savannah', 'Oti', 'North East', 'Western North',
]

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
}

const CONDITION_COLORS: Record<string, string> = {
  good: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  fair: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  poor: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  blocked: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  resolved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  ignored: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const HAZARD_LABELS: Record<string, string> = {
  pothole: 'Pothole',
  flood: 'Flood',
  accident: 'Accident',
  construction: 'Construction',
  erosion: 'Erosion',
  none: 'None',
}

export function RoadConditionsView() {
  const [reports, setReports] = useState<RoadConditionReport[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [editingReport, setEditingReport] = useState<RoadConditionReport | null>(null)

  // Filters
  const [filterRegion, setFilterRegion] = useState('all')
  const [filterSeverity, setFilterSeverity] = useState('all')

  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page, limit: 20 }
      if (activeTab === 'active') params.status = 'active'
      else if (activeTab === 'critical') params.severity = 'critical'
      else if (activeTab === 'resolved') params.status = 'resolved'
      if (filterRegion && filterRegion !== 'all') params.region = filterRegion
      if (filterSeverity && filterSeverity !== 'all') params.severity = filterSeverity
      const res = await fetchRoadConditions(params as Parameters<typeof fetchRoadConditions>[0])
      setReports(res.data)
      setTotal(res.total || 0)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load road conditions')
    } finally {
      setLoading(false)
    }
  }, [page, activeTab, filterRegion, filterSeverity])

  useEffect(() => { loadReports() }, [loadReports])

  const summaryCards = [
    { label: 'Active Reports', value: reports.filter(r => r.status === 'active').length, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Critical Alerts', value: reports.filter(r => r.severity === 'critical' && r.status === 'active').length, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Resolved Today', value: reports.filter(r => {
      if (r.status !== 'resolved' || !r.resolvedAt) return false
      return new Date(r.resolvedAt).toDateString() === new Date().toDateString()
    }).length, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Regions', value: new Set(reports.map(r => r.region)).size, icon: MapPin, color: 'text-sky-600', bg: 'bg-sky-50' },
  ]

  const totalPages = Math.ceil(total / 20)

  const handleSave = async (data: Record<string, string>) => {
    try {
      if (editingReport) {
        await updateRoadConditionReport(editingReport.id, {
          roadName: data.roadName,
          region: data.region,
          condition: data.condition,
          hazardType: data.hazardType || 'none',
          description: data.description || '',
          severity: data.severity,
          latitude: data.latitude ? parseFloat(data.latitude) : null,
          longitude: data.longitude ? parseFloat(data.longitude) : null,
        })
        toast.success('Report updated successfully')
      } else {
        await createRoadConditionReport({
          roadName: data.roadName,
          region: data.region,
          condition: data.condition,
          hazardType: data.hazardType || 'none',
          description: data.description || '',
          severity: data.severity,
          latitude: data.latitude ? parseFloat(data.latitude) : null,
          longitude: data.longitude ? parseFloat(data.longitude) : null,
        })
        toast.success('Road condition reported successfully')
      }
      setShowReportDialog(false)
      setEditingReport(null)
      loadReports()
    } catch (err) {
      toast.error(editingReport ? 'Failed to update report' : 'Failed to create report')
    }
  }

  const handleStatus = async (id: string, status: string) => {
    try {
      await updateRoadConditionReport(id, { status })
      toast.success(`Report ${status}`)
      loadReports()
    } catch (err) {
      toast.error('Failed to update report')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteRoadConditionReport(id)
      toast.success('Report deleted')
      loadReports()
    } catch (err) {
      toast.error('Failed to delete report')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Road Conditions</h1>
          <p className="text-sm text-muted-foreground">Monitor and report road hazards across Ghana</p>
        </div>
        <Button onClick={() => { setEditingReport(null); setShowReportDialog(true) }} className="gap-2">
          <Plus className="h-4 w-4" /> Report Condition
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card, i) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterRegion} onValueChange={setFilterRegion}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All Regions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {GHANA_REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterSeverity} onValueChange={setFilterSeverity}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severity</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { setPage(1); loadReports() }} className="gap-1 ml-auto">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="critical">Critical</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Road</th>
                <th className="text-left p-3 font-medium">Region</th>
                <th className="text-left p-3 font-medium">Condition</th>
                <th className="text-left p-3 font-medium">Hazard</th>
                <th className="text-left p-3 font-medium">Severity</th>
                <th className="text-left p-3 font-medium">Reported</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : reports.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No reports found</td></tr>
              ) : (
                reports.map((report, i) => (
                  <motion.tr
                    key={report.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-muted/30"
                  >
                    <td className="p-3">
                      <div className="font-medium">{report.roadName}</div>
                      {report.trip && <div className="text-xs text-muted-foreground">Trip: {report.trip.tripNumber}</div>}
                    </td>
                    <td className="p-3 text-muted-foreground">{report.region}</td>
                    <td className="p-3"><Badge variant="secondary" className={CONDITION_COLORS[report.condition] || ''}>{report.condition}</Badge></td>
                    <td className="p-3 text-muted-foreground">{HAZARD_LABELS[report.hazardType] || report.hazardType}</td>
                    <td className="p-3"><Badge variant="secondary" className={SEVERITY_COLORS[report.severity] || ''}>{report.severity}</Badge></td>
                    <td className="p-3 text-muted-foreground">{new Date(report.reportedAt).toLocaleDateString()}</td>
                    <td className="p-3"><Badge variant="secondary" className={STATUS_COLORS[report.status] || ''}>{report.status}</Badge></td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setEditingReport(report); setShowReportDialog(true) }} className="text-sky-500 hover:text-sky-600 h-8 w-8 p-0" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {report.status === 'active' && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleStatus(report.id, 'resolved')} className="text-emerald-600 hover:text-emerald-700 h-8 w-8 p-0" title="Resolve">
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleStatus(report.id, 'ignored')} className="text-gray-500 hover:text-gray-600 h-8 w-8 p-0" title="Ignore">
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(report.id)} className="text-red-500 hover:text-red-600 h-8 w-8 p-0" title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : reports.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No reports found</div>
          ) : (
            reports.map((report) => (
              <motion.div
                key={report.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="mobile-card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{report.roadName}</p>
                      {report.trip && <p className="text-xs text-muted-foreground">Trip: {report.trip.tripNumber}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="secondary" className={STATUS_COLORS[report.status] || ''}>{report.status}</Badge>
                      <Button variant="ghost" size="sm" onClick={() => { setEditingReport(report); setShowReportDialog(true) }} className="text-sky-500 hover:text-sky-600 h-7 w-7 p-0" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {report.status === 'active' && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => handleStatus(report.id, 'resolved')} className="text-emerald-600 hover:text-emerald-700 h-7 w-7 p-0" title="Resolve">
                            <CheckCircle className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleStatus(report.id, 'ignored')} className="text-gray-500 hover:text-gray-600 h-7 w-7 p-0" title="Ignore">
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(report.id)} className="text-red-500 hover:text-red-600 h-7 w-7 p-0" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground"><MapPin className="h-3 w-3 inline mr-0.5" />{report.region}</span>
                    <span className="text-xs text-muted-foreground">{new Date(report.reportedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className={CONDITION_COLORS[report.condition] || ''}>{report.condition}</Badge>
                    <Badge variant="secondary" className={SEVERITY_COLORS[report.severity] || ''}>{report.severity}</Badge>
                    <Badge variant="outline" className="text-xs font-normal">{HAZARD_LABELS[report.hazardType] || report.hazardType}</Badge>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-muted-foreground">Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, total)} of {total}</p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Report Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingReport ? 'Edit' : 'Report'} Road Condition</DialogTitle>
            <DialogDescription>Share road condition information with the fleet</DialogDescription>
          </DialogHeader>
          <ReportForm onSubmit={handleSave} onCancel={() => { setShowReportDialog(false); setEditingReport(null) }} initialData={editingReport} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ReportForm({ onSubmit, onCancel, initialData }: {
  onSubmit: (data: Record<string, string>) => void
  onCancel: () => void
  initialData: RoadConditionReport | null
}) {
  const [roadName, setRoadName] = useState(initialData?.roadName || '')
  const [region, setRegion] = useState(initialData?.region || '')
  const [condition, setCondition] = useState(initialData?.condition || '')
  const [hazardType, setHazardType] = useState(initialData?.hazardType || 'none')
  const [severity, setSeverity] = useState(initialData?.severity || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [latitude, setLatitude] = useState(initialData?.latitude?.toString() || '')
  const [longitude, setLongitude] = useState(initialData?.longitude?.toString() || '')

  const handleSubmit = () => {
    if (!roadName || !region || !condition || !severity) {
      toast.error('Please fill required fields')
      return
    }
    onSubmit({ roadName, region, condition, hazardType, severity, description, latitude, longitude })
  }

  return (
    <>
      <DialogBody className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Road Name *</Label>
          <Input placeholder="e.g. N1 Accra-Kumasi Highway" value={roadName} onChange={e => setRoadName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Region *</Label>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger><SelectValue placeholder="Select region" /></SelectTrigger>
            <SelectContent>
              {GHANA_REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Condition *</Label>
          <Select value={condition} onValueChange={setCondition}>
            <SelectTrigger><SelectValue placeholder="Select condition" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="good">Good</SelectItem>
              <SelectItem value="fair">Fair</SelectItem>
              <SelectItem value="poor">Poor</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Severity *</Label>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger><SelectValue placeholder="Select severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Hazard Type</Label>
          <Select value={hazardType} onValueChange={setHazardType}>
            <SelectTrigger><SelectValue placeholder="Select hazard type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="pothole">Pothole</SelectItem>
              <SelectItem value="flood">Flood</SelectItem>
              <SelectItem value="accident">Accident</SelectItem>
              <SelectItem value="construction">Construction</SelectItem>
              <SelectItem value="erosion">Erosion</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea placeholder="Describe the road condition..." value={description} onChange={e => setDescription(e.target.value)} rows={3} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Latitude</Label>
          <Input type="number" step="any" placeholder="e.g. 5.6037" value={latitude} onChange={e => setLatitude(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Longitude</Label>
          <Input type="number" step="any" placeholder="e.g. -0.1870" value={longitude} onChange={e => setLongitude(e.target.value)} />
        </div>
      </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit}>{initialData ? 'Update Report' : 'Submit Report'}</Button>
      </DialogFooter>
    </>
  )
}
