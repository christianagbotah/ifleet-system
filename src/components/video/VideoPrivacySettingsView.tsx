'use client'

import * as React from 'react'
import { Camera, Cloud, Save, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api'

const ROLE_OPTIONS = ['Admin', 'Manager', 'Operations Manager', 'Dispatcher']

type DevicePolicy = {
  id: string
  name: string
  provider: string
  status: string
  cameraChannels: Array<{ key: string; label: string; privacyClass: string }>
  videoRetentionPolicy: null | {
    id: string
    policyVersion: number
    effectiveAt: string
    routineRetentionDays: number
    incidentRetentionDays: number
    applyToExisting: boolean
    cloudUploadEnabled: boolean
    allowedRoles: string[]
    allowedChannels: string[] | null
    privacyNoticeVersion: string
    privacyNoticeText: string | null
  }
}

type FormState = {
  routineRetentionDays: number
  incidentRetentionDays: number
  applyToExisting: boolean
  cloudUploadEnabled: boolean
  allowedRoles: string[]
  allowedChannels: string[]
  privacyNoticeVersion: string
  privacyNoticeText: string
}

function toForm(device: DevicePolicy): FormState {
  const policy = device.videoRetentionPolicy
  return {
    routineRetentionDays: policy?.routineRetentionDays ?? 7,
    incidentRetentionDays: policy?.incidentRetentionDays ?? 30,
    applyToExisting: false,
    cloudUploadEnabled: policy?.cloudUploadEnabled ?? false,
    allowedRoles: policy?.allowedRoles?.length ? policy.allowedRoles : ['Admin', 'Manager'],
    allowedChannels: policy?.allowedChannels ?? device.cameraChannels.map((channel) => channel.key),
    privacyNoticeVersion: policy?.privacyNoticeVersion ?? '1',
    privacyNoticeText: policy?.privacyNoticeText ?? 'Video telematics may be used for road safety, incident review and fleet security. Access is audited and limited by role and channel privacy policy.',
  }
}

function ToggleChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? 'border-amber-500 bg-amber-500 text-white' : 'bg-background text-muted-foreground hover:border-amber-400 hover:text-foreground'}`}
    >
      {label}
    </button>
  )
}

export function VideoPrivacySettingsView() {
  const [devices, setDevices] = React.useState<DevicePolicy[]>([])
  const [selectedId, setSelectedId] = React.useState('')
  const [form, setForm] = React.useState<FormState | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const selected = devices.find((device) => device.id === selectedId) ?? null

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch<{ data: DevicePolicy[] }>('/api/video/privacy')
      setDevices(response.data)
      const nextId = response.data.some((device) => device.id === selectedId) ? selectedId : response.data[0]?.id ?? ''
      setSelectedId(nextId)
      const next = response.data.find((device) => device.id === nextId)
      setForm(next ? toForm(next) : null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load video privacy settings')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  React.useEffect(() => { void load() }, [])

  function chooseDevice(id: string) {
    setSelectedId(id)
    const device = devices.find((item) => item.id === id)
    setForm(device ? toForm(device) : null)
  }

  function toggleList(field: 'allowedRoles' | 'allowedChannels', value: string) {
    setForm((current) => {
      if (!current) return current
      const values = current[field]
      return { ...current, [field]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] }
    })
  }

  async function save() {
    if (!selected || !form) return
    if (!form.allowedRoles.length) return toast.error('Allow at least one role to access video')
    if (form.incidentRetentionDays < form.routineRetentionDays) return toast.error('Incident retention cannot be shorter than routine retention')
    setSaving(true)
    try {
      await apiFetch('/api/video/privacy', {
        method: 'PATCH',
        body: JSON.stringify({ deviceId: selected.id, ...form }),
      })
      toast.success('Video privacy policy updated')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save video privacy settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading video privacy settings…</div>

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-amber-500 p-2.5 text-white shadow-lg shadow-amber-500/20"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Video Privacy & Retention</h1>
            <p className="text-sm text-muted-foreground">Control who can view cameras, how long managed copies are retained, and which privacy notice applies.</p>
          </div>
        </div>
        {selected?.videoRetentionPolicy && (
          <div className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">Policy v{selected.videoRetentionPolicy.policyVersion} · effective {new Date(selected.videoRetentionPolicy.effectiveAt).toLocaleString()}</div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Card>
          <CardHeader><CardTitle className="text-base">Camera devices</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {devices.length === 0 && <p className="text-sm text-muted-foreground">No video-capable telematics devices are registered.</p>}
            {devices.map((device) => (
              <button key={device.id} type="button" onClick={() => chooseDevice(device.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === device.id ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : 'hover:border-amber-300'}`}>
                <div className="flex items-center gap-2"><Camera className="h-4 w-4" /><span className="text-sm font-semibold">{device.name}</span></div>
                <p className="mt-1 text-xs text-muted-foreground">{device.provider} · {device.cameraChannels.length} channels</p>
              </button>
            ))}
          </CardContent>
        </Card>

        {selected && form && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Retention policy</CardTitle></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="routineRetentionDays">Routine retention days</Label><Input id="routineRetentionDays" type="number" min={1} max={3650} value={form.routineRetentionDays} onChange={(e) => setForm({ ...form, routineRetentionDays: Number(e.target.value) })} /></div>
                <div className="space-y-2"><Label htmlFor="incidentRetentionDays">Incident retention days</Label><Input id="incidentRetentionDays" type="number" min={1} max={3650} value={form.incidentRetentionDays} onChange={(e) => setForm({ ...form, incidentRetentionDays: Number(e.target.value) })} /></div>
                <div className="flex items-center justify-between gap-4 rounded-xl border p-3 md:col-span-2"><div><p className="text-sm font-medium">Cloud-copy retention</p><p className="text-xs text-muted-foreground">Off by default. Provider/edge recordings remain provider-managed unless this is explicitly enabled.</p></div><Switch checked={form.cloudUploadEnabled} onCheckedChange={(checked) => setForm({ ...form, cloudUploadEnabled: checked })} /></div>
                <div className="flex items-center justify-between gap-4 rounded-xl border p-3 md:col-span-2"><div><p className="text-sm font-medium">Apply this retention duration to existing managed copies</p><p className="text-xs text-muted-foreground">Off keeps each existing record&apos;s original retain-until date. Enable only for an intentional retroactive policy change.</p></div><Switch checked={form.applyToExisting} onCheckedChange={(checked) => setForm({ ...form, applyToExisting: checked })} /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Access policy</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label>Allowed roles</Label><div className="mt-2 flex flex-wrap gap-2">{ROLE_OPTIONS.map((role) => <ToggleChip key={role} label={role} active={form.allowedRoles.includes(role)} onClick={() => toggleList('allowedRoles', role)} />)}</div></div>
                <div><Label>Allowed channels</Label><div className="mt-2 flex flex-wrap gap-2">{selected.cameraChannels.map((channel) => <ToggleChip key={channel.key} label={`${channel.label} · ${channel.privacyClass}`} active={form.allowedChannels.includes(channel.key)} onClick={() => toggleList('allowedChannels', channel.key)} />)}</div></div>
                <p className="text-xs text-muted-foreground">Driver-facing channels still require the elevated <code>video.driver.view</code> permission even when the role and channel are allowed here.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Privacy notice & acknowledgement</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2"><Label htmlFor="privacyNoticeVersion">Notice version</Label><Input id="privacyNoticeVersion" value={form.privacyNoticeVersion} onChange={(e) => setForm({ ...form, privacyNoticeVersion: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="privacyNoticeText">Privacy notice</Label><Textarea id="privacyNoticeText" rows={5} value={form.privacyNoticeText} onChange={(e) => setForm({ ...form, privacyNoticeText: e.target.value })} /></div>
                <p className="text-xs text-muted-foreground">Acknowledgements are stored against the policy version and notice version so later policy changes do not rewrite historical consent evidence.</p>
              </CardContent>
            </Card>

            <div className="flex justify-end"><Button onClick={() => void save()} disabled={saving} className="gap-2"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save privacy policy'}</Button></div>
            <div className="flex items-start gap-2 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground"><Cloud className="mt-0.5 h-4 w-4 shrink-0" /><span>Retention cleanup applies only to iFleetPro-managed cloud/local copies. Provider-owned recordings are never deleted by iFleetPro.</span></div>
          </div>
        )}
      </div>
    </div>
  )
}
