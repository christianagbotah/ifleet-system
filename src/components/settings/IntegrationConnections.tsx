'use client'

import * as React from 'react'
import { Cable, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface Connection {
  id: string
  name: string
  provider: string
  type: string
  config: Record<string, unknown>
  secretRef: string | null
  hasSecretRef: boolean
  status: string
  lastSuccessAt: string | null
  lastErrorAt: string | null
  lastError: string | null
  updatedAt: string
}

const EMPTY_FORM = { name: '', provider: '', type: 'webhook', secretRef: '', config: '{}' }

export function IntegrationConnections() {
  const user = useAuthStore((state) => state.user)
  const isAdmin = user?.role === 'Admin'
  const [items, setItems] = React.useState<Connection[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Connection | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState(EMPTY_FORM)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setItems(await apiFetch<Connection[]>('/api/integrations/connections'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load integrations')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(item: Connection) {
    setEditing(item)
    setForm({
      name: item.name,
      provider: item.provider,
      type: item.type,
      secretRef: item.secretRef ?? '',
      config: JSON.stringify(item.config ?? {}, null, 2),
    })
    setDialogOpen(true)
  }

  async function save() {
    let config: Record<string, unknown>
    try {
      const parsed = JSON.parse(form.config || '{}')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Config must be a JSON object')
      config = parsed
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Config must be valid JSON')
      return
    }

    setSaving(true)
    try {
      await apiFetch(editing ? `/api/integrations/connections/${editing.id}` : '/api/integrations/connections', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...form, config, secretRef: form.secretRef || null }),
      })
      toast.success(editing ? 'Integration updated' : 'Integration created')
      setDialogOpen(false)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save integration')
    } finally {
      setSaving(false)
    }
  }

  async function toggle(item: Connection) {
    try {
      await apiFetch(`/api/integrations/connections/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: item.status === 'active' ? 'inactive' : 'active' }),
      })
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to change integration status')
    }
  }

  async function remove(item: Connection) {
    if (!window.confirm(`Delete integration “${item.name}”?`)) return
    try {
      await apiFetch(`/api/integrations/connections/${item.id}`, { method: 'DELETE' })
      toast.success('Integration deleted')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete integration')
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-sky-100 p-2.5 dark:bg-sky-900/30"><Cable className="h-5 w-5 text-sky-600 dark:text-sky-400" /></div>
            <div>
              <CardTitle className="text-base">Integration Connections</CardTitle>
              <CardDescription>Connect shippers, factories and external systems using secret references—never stored credentials.</CardDescription>
            </div>
          </div>
          {isAdmin && <Button size="sm" onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />Add connection</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading integrations…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No integration connections configured yet.</div>
        ) : items.map((item) => (
          <div key={item.id} className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{item.name}</span>
                <Badge variant={item.status === 'active' ? 'default' : 'outline'}>{item.status}</Badge>
                {item.hasSecretRef && <Badge variant="secondary" className="gap-1"><ShieldCheck className="h-3 w-3" />Secret ref</Badge>}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{item.provider} · {item.type}{item.lastError ? ` · ${item.lastError}` : ''}</div>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => toggle(item)}>{item.status === 'active' ? 'Disable' : 'Enable'}</Button>
                <Button size="icon" variant="ghost" onClick={() => openEdit(item)} aria-label="Edit integration"><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="text-red-600" onClick={() => remove(item)} aria-label="Delete integration"><Trash2 className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit integration connection' : 'Add integration connection'}</DialogTitle>
            <DialogDescription>Store only non-secret metadata here. Credentials belong in server secret storage and are referenced by URI.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} placeholder="GHACEM Load Orders" /></div>
              <div className="space-y-2"><Label>Provider</Label><Input value={form.provider} onChange={(e) => setForm((v) => ({ ...v, provider: e.target.value }))} placeholder="ghacem" /></div>
              <div className="space-y-2"><Label>Connection type</Label><Select value={form.type} onValueChange={(value) => setForm((v) => ({ ...v, type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="webhook">Webhook</SelectItem><SelectItem value="api">API</SelectItem><SelectItem value="csv">CSV / Excel</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Secret reference</Label><Input value={form.secretRef} onChange={(e) => setForm((v) => ({ ...v, secretRef: e.target.value }))} placeholder="env://GHACEM_WEBHOOK_SECRET" /></div>
            </div>
            <div className="space-y-2"><Label>Non-secret config (JSON)</Label><Textarea rows={8} value={form.config} onChange={(e) => setForm((v) => ({ ...v, config: e.target.value }))} className="font-mono text-xs" /></div>
          </DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? 'Save changes' : 'Create connection'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
