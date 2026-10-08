'use client'

import * as React from 'react'
import { Building2, Pencil, Plus, Search, Settings2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDebounce } from '@/hooks/use-debounce'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'

interface LoadingPointOption { id: string; name: string; loadingCity?: { name: string } }
interface SiteRuleRecord {
  id?: string
  loadingPointId: string
  requiredDocuments?: string | null
  allowedVehicleTypes?: string | null
  allowedTrailerTypes?: string | null
  weighingStages?: string | null
  sealRequired?: boolean | null
  podRequirements?: string | null
  loadingPoint?: LoadingPointOption
}
interface ShipperProfileRecord {
  id: string
  code: string
  name: string
  profileType: string
  requiredDocuments: string | null
  allowedVehicleTypes: string | null
  allowedTrailerTypes: string | null
  weighingStages: string | null
  sealRequired: boolean
  podRequirements: string | null
  acceptedQuantityVariance: number
  integrationMode: string
  isActive: boolean
  ShipperSiteRule: SiteRuleRecord[]
  _count?: { LoadOrder: number; TransportContract: number; TransportRateCard: number }
}
interface SiteRuleForm { loadingPointId: string; requiredDocuments: string; allowedVehicleTypes: string; allowedTrailerTypes: string; weighingStages: string; sealRequired: boolean; podRequirements: string }
interface ProfileForm { code: string; name: string; profileType: string; requiredDocuments: string; allowedVehicleTypes: string; allowedTrailerTypes: string; weighingStages: string; sealRequired: boolean; podRequirements: string; acceptedQuantityVariance: string; integrationMode: string; isActive: boolean; siteRules: SiteRuleForm[] }

const blank: ProfileForm = { code: '', name: '', profileType: 'general', requiredDocuments: '', allowedVehicleTypes: '', allowedTrailerTypes: '', weighingStages: '', sealRequired: false, podRequirements: '', acceptedQuantityVariance: '0', integrationMode: 'manual', isActive: true, siteRules: [] }
const emptyRule = (): SiteRuleForm => ({ loadingPointId: '', requiredDocuments: '', allowedVehicleTypes: '', allowedTrailerTypes: '', weighingStages: '', sealRequired: false, podRequirements: '' })
function listText(value: string | null | undefined) { if (!value) return ''; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.join(', ') : value } catch { return value } }

export function ShipperProfilesView() {
  const { user } = useAuthStore()
  const canWrite = user?.role !== 'Driver'
  const [profiles, setProfiles] = React.useState<ShipperProfileRecord[]>([])
  const [loadingPoints, setLoadingPoints] = React.useState<LoadingPointOption[]>([])
  const [search, setSearch] = React.useState('')
  const debounced = useDebounce(search, 300)
  const [loading, setLoading] = React.useState(true)
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ShipperProfileRecord | null>(null)
  const [form, setForm] = React.useState<ProfileForm>(blank)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const query = debounced ? `?search=${encodeURIComponent(debounced)}` : ''
      const [profileResult, pointResult] = await Promise.all([
        apiFetch<{ data: ShipperProfileRecord[] }>(`/api/shipper-profiles${query}`),
        apiFetch<{ data: LoadingPointOption[] }>('/api/loading-points?limit=100&isActive=true'),
      ])
      setProfiles(profileResult.data ?? [])
      setLoadingPoints(pointResult.data ?? [])
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to load shipper profiles') }
    finally { setLoading(false) }
  }, [debounced])
  React.useEffect(() => { load() }, [load])

  function createProfile() { setEditing(null); setForm(blank); setOpen(true) }
  function editProfile(profile: ShipperProfileRecord) {
    setEditing(profile)
    setForm({
      code: profile.code, name: profile.name, profileType: profile.profileType,
      requiredDocuments: listText(profile.requiredDocuments), allowedVehicleTypes: listText(profile.allowedVehicleTypes), allowedTrailerTypes: listText(profile.allowedTrailerTypes),
      weighingStages: listText(profile.weighingStages), sealRequired: profile.sealRequired, podRequirements: listText(profile.podRequirements),
      acceptedQuantityVariance: String(profile.acceptedQuantityVariance ?? 0), integrationMode: profile.integrationMode, isActive: profile.isActive,
      siteRules: profile.ShipperSiteRule.map((rule) => ({ loadingPointId: rule.loadingPointId, requiredDocuments: listText(rule.requiredDocuments), allowedVehicleTypes: listText(rule.allowedVehicleTypes), allowedTrailerTypes: listText(rule.allowedTrailerTypes), weighingStages: listText(rule.weighingStages), sealRequired: rule.sealRequired ?? false, podRequirements: listText(rule.podRequirements) })),
    })
    setOpen(true)
  }
  function updateRule(index: number, patch: Partial<SiteRuleForm>) { setForm((current) => ({ ...current, siteRules: current.siteRules.map((rule, i) => i === index ? { ...rule, ...patch } : rule) })) }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true)
    try {
      const payload = { ...form, acceptedQuantityVariance: Number(form.acceptedQuantityVariance || 0), siteRules: form.siteRules.filter((rule) => rule.loadingPointId) }
      await apiFetch('/api/shipper-profiles', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(editing ? { ...payload, id: editing.id } : payload) })
      toast.success(editing ? 'Shipper profile updated' : 'Shipper profile created'); setOpen(false); await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to save shipper profile') }
    finally { setSaving(false) }
  }

  return <div className="space-y-4 sm:space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold tracking-tight">Shipper Profiles</h1><p className="text-muted-foreground">Configure loading, document, vehicle, weighing, seal and POD rules without hard-coding factory brands.</p></div>{canWrite && <Button onClick={createProfile} className="bg-amber-500 text-white hover:bg-amber-600"><Plus className="mr-2 h-4 w-4" />Add Profile</Button>}</div>
    <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search code, shipper or profile type..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
    <Card><CardContent className="p-0">{loading ? <div className="space-y-3 p-4">{[1,2,3].map((i)=><Skeleton key={i} className="h-14 w-full" />)}</div> : profiles.length === 0 ? <EmptyState icon={Building2} title="No shipper profiles" description="Create a configurable shipper profile for loading-site rules." action={canWrite ? { label:'Add Profile', onClick:createProfile } : undefined} /> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Shipper</TableHead><TableHead>Type</TableHead><TableHead>Core Rules</TableHead><TableHead>Sites</TableHead><TableHead>Integration</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{profiles.map((profile)=><TableRow key={profile.id}><TableCell><div className="font-semibold">{profile.name}</div><div className="text-xs text-muted-foreground">{profile.code}</div></TableCell><TableCell>{profile.profileType}</TableCell><TableCell><div className="text-sm">{profile.sealRequired ? 'Seal required' : 'Seal optional'} · {listText(profile.weighingStages) || 'No weighing stages'}</div><div className="text-xs text-muted-foreground">POD: {listText(profile.podRequirements) || 'standard'}</div></TableCell><TableCell>{profile.ShipperSiteRule.length}</TableCell><TableCell>{profile.integrationMode}</TableCell><TableCell><Badge variant={profile.isActive ? 'default' : 'secondary'}>{profile.isActive ? 'Active' : 'Inactive'}</Badge></TableCell><TableCell className="text-right">{canWrite && <Button variant="ghost" size="icon" onClick={()=>editProfile(profile)}><Pencil className="h-4 w-4" /></Button>}</TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><form onSubmit={save}><DialogHeader><DialogTitle>{editing ? 'Edit Shipper Profile' : 'Add Shipper Profile'}</DialogTitle></DialogHeader><DialogBody className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Code"><Input value={form.code} onChange={(e)=>setForm({...form,code:e.target.value})} required /></Field><Field label="Name"><Input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} required /></Field><Field label="Profile type"><Input value={form.profileType} onChange={(e)=>setForm({...form,profileType:e.target.value})} placeholder="cement / FMCG / general" /></Field><Field label="Integration"><Select value={form.integrationMode} onValueChange={(value)=>setForm({...form,integrationMode:value})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Manual</SelectItem><SelectItem value="csv">CSV / Excel</SelectItem><SelectItem value="api">API</SelectItem><SelectItem value="webhook">Webhook</SelectItem><SelectItem value="erp">ERP / EDI</SelectItem></SelectContent></Select></Field></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Required documents"><Input value={form.requiredDocuments} onChange={(e)=>setForm({...form,requiredDocuments:e.target.value})} placeholder="waybill, roadworthy, insurance" /></Field><Field label="Allowed vehicle types"><Input value={form.allowedVehicleTypes} onChange={(e)=>setForm({...form,allowedVehicleTypes:e.target.value})} placeholder="tractor, rigid" /></Field><Field label="Allowed trailer types"><Input value={form.allowedTrailerTypes} onChange={(e)=>setForm({...form,allowedTrailerTypes:e.target.value})} placeholder="flatbed, bulk tanker" /></Field><Field label="Weighing stages"><Input value={form.weighingStages} onChange={(e)=>setForm({...form,weighingStages:e.target.value})} placeholder="tare, gross, axle" /></Field><Field label="POD requirements"><Input value={form.podRequirements} onChange={(e)=>setForm({...form,podRequirements:e.target.value})} placeholder="signature, photo, receiver ID" /></Field><Field label="Accepted quantity variance %"><Input type="number" min="0" step="0.01" value={form.acceptedQuantityVariance} onChange={(e)=>setForm({...form,acceptedQuantityVariance:e.target.value})} /></Field></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.sealRequired} onChange={(e)=>setForm({...form,sealRequired:e.target.checked})} />Seal required before gate-out</label>
      <div className="rounded-lg border p-4"><div className="mb-3 flex items-center justify-between"><div><div className="font-semibold">Loading-site overrides</div><div className="text-xs text-muted-foreground">Override the profile for a specific factory, depot or loading point.</div></div><Button type="button" variant="outline" size="sm" onClick={()=>setForm({...form,siteRules:[...form.siteRules,emptyRule()]})}><Plus className="mr-2 h-4 w-4" />Site rule</Button></div><div className="space-y-4">{form.siteRules.map((rule,index)=><div key={index} className="grid gap-3 rounded-md bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Loading point"><Select value={rule.loadingPointId || 'none'} onValueChange={(value)=>updateRule(index,{loadingPointId:value==='none'?'':value})}><SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger><SelectContent><SelectItem value="none">Select site</SelectItem>{loadingPoints.map((point)=><SelectItem key={point.id} value={point.id}>{point.name}{point.loadingCity?.name ? ` · ${point.loadingCity.name}`:''}</SelectItem>)}</SelectContent></Select></Field><Field label="Required documents"><Input value={rule.requiredDocuments} onChange={(e)=>updateRule(index,{requiredDocuments:e.target.value})} /></Field><Field label="Vehicle types"><Input value={rule.allowedVehicleTypes} onChange={(e)=>updateRule(index,{allowedVehicleTypes:e.target.value})} /></Field><Field label="Trailer types"><Input value={rule.allowedTrailerTypes} onChange={(e)=>updateRule(index,{allowedTrailerTypes:e.target.value})} /></Field><Field label="Weighing stages"><Input value={rule.weighingStages} onChange={(e)=>updateRule(index,{weighingStages:e.target.value})} /></Field><Field label="POD requirements"><Input value={rule.podRequirements} onChange={(e)=>updateRule(index,{podRequirements:e.target.value})} /></Field><label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={rule.sealRequired} onChange={(e)=>updateRule(index,{sealRequired:e.target.checked})} />Seal required</label><Button type="button" variant="ghost" onClick={()=>setForm({...form,siteRules:form.siteRules.filter((_,i)=>i!==index)})}><Trash2 className="mr-2 h-4 w-4" />Remove</Button></div>)}</div></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e)=>setForm({...form,isActive:e.target.checked})} />Profile active</label>
    </DialogBody><DialogFooter><Button type="button" variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}><Settings2 className="mr-2 h-4 w-4" />{saving ? 'Saving...' : 'Save Profile'}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div> }
