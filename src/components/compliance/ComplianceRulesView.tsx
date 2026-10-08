'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ChevronRight,
  History,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface ComplianceRuleRecord {
  id: string
  type: string
  metric?: string | null
  scope: string | Record<string, unknown>
  operator: string
  value: string | unknown
  unit?: string | null
  severity: 'blocking' | 'warning' | string
  priority: number
  effectiveFrom: string
  effectiveTo?: string | null
  isActive: boolean
  description?: string | null
}

interface ComplianceRuleSetRecord {
  id: string
  code: string
  name: string
  version: number
  country?: string | null
  description?: string | null
  effectiveFrom: string
  effectiveTo?: string | null
  isCurrent: boolean
  isActive: boolean
  createdAt: string
  rules: ComplianceRuleRecord[]
}

interface RuleDraft {
  type: string
  scopeCountry: string
  shipperId: string
  vehicleType: string
  trailerType: string
  commodityId: string
  operator: string
  value: string
  unit: string
  severity: 'blocking' | 'warning'
  priority: string
  description: string
}

interface RuleSetDraft {
  name: string
  code: string
  country: string
  description: string
  effectiveFrom: string
  effectiveTo: string
  rules: RuleDraft[]
}

const inputClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring'
const textAreaClass = 'min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring'

function dateInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : ''
}

function emptyRule(): RuleDraft {
  return {
    type: '',
    scopeCountry: '',
    shipperId: '',
    vehicleType: '',
    trailerType: '',
    commodityId: '',
    operator: 'lte',
    value: '',
    unit: '',
    severity: 'blocking',
    priority: '0',
    description: '',
  }
}

function emptyDraft(): RuleSetDraft {
  return {
    name: '',
    code: '',
    country: 'GH',
    description: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: '',
    rules: [emptyRule()],
  }
}

function parseStored(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function displayValue(value: unknown): string {
  const parsed = parseStored(value)
  return typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
}

function parseLooseValue(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

function scopeObject(scope: ComplianceRuleRecord['scope']): Record<string, unknown> {
  const parsed = parseStored(scope)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
}

function draftFromRuleSet(ruleSet: ComplianceRuleSetRecord): RuleSetDraft {
  return {
    name: ruleSet.name,
    code: ruleSet.code,
    country: ruleSet.country ?? '',
    description: ruleSet.description ?? '',
    effectiveFrom: dateInput(ruleSet.effectiveFrom),
    effectiveTo: dateInput(ruleSet.effectiveTo),
    rules: ruleSet.rules.map((rule) => {
      const scope = scopeObject(rule.scope)
      return {
        type: rule.type,
        scopeCountry: String(scope.country ?? ''),
        shipperId: String(scope.shipperId ?? ''),
        vehicleType: String(scope.vehicleType ?? ''),
        trailerType: String(scope.trailerType ?? ''),
        commodityId: String(scope.commodityId ?? ''),
        operator: rule.operator,
        value: displayValue(rule.value),
        unit: rule.unit ?? '',
        severity: rule.severity === 'warning' ? 'warning' : 'blocking',
        priority: String(rule.priority ?? 0),
        description: rule.description ?? '',
      }
    }),
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`
    throw new Error(message)
  }
  return payload as T
}

export function ComplianceRulesView() {
  const [ruleSets, setRuleSets] = useState<ComplianceRuleSetRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAllVersions, setShowAllVersions] = useState(false)
  const [editing, setEditing] = useState<'create' | 'revise' | null>(null)
  const [draft, setDraft] = useState<RuleSetDraft>(emptyDraft)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const suffix = showAllVersions ? '?allVersions=true' : ''
      const response = await requestJson<{ data: ComplianceRuleSetRecord[] }>(`/api/compliance/rule-sets${suffix}`)
      setRuleSets(response.data)
      setSelectedId((current) => {
        if (current && response.data.some((item) => item.id === current)) return current
        return response.data[0]?.id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load compliance rule sets')
    } finally {
      setLoading(false)
    }
  }, [showAllVersions])

  useEffect(() => {
    load()
  }, [load])

  const selected = useMemo(
    () => ruleSets.find((item) => item.id === selectedId) ?? null,
    [ruleSets, selectedId],
  )

  function startCreate() {
    setDraft(emptyDraft())
    setEditing('create')
  }

  function startRevise() {
    if (!selected || !selected.isCurrent) return
    setDraft(draftFromRuleSet(selected))
    setEditing('revise')
  }

  function updateRule(index: number, patch: Partial<RuleDraft>) {
    setDraft((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule),
    }))
  }

  function removeRule(index: number) {
    setDraft((current) => ({
      ...current,
      rules: current.rules.length === 1 ? current.rules : current.rules.filter((_, ruleIndex) => ruleIndex !== index),
    }))
  }

  async function submitDraft() {
    if (!draft.name.trim() || !draft.effectiveFrom || draft.rules.some((rule) => !rule.type.trim())) {
      setError('Name, Effective From and every rule Type are required.')
      return
    }

    const rules = draft.rules.map((rule) => ({
      type: rule.type.trim(),
      scope: {
        ...(rule.scopeCountry.trim() ? { country: rule.scopeCountry.trim().toUpperCase() } : {}),
        ...(rule.shipperId.trim() ? { shipperId: rule.shipperId.trim() } : {}),
        ...(rule.vehicleType.trim() ? { vehicleType: rule.vehicleType.trim() } : {}),
        ...(rule.trailerType.trim() ? { trailerType: rule.trailerType.trim() } : {}),
        ...(rule.commodityId.trim() ? { commodityId: rule.commodityId.trim() } : {}),
      },
      operator: rule.operator,
      value: parseLooseValue(rule.value),
      unit: rule.unit.trim() || null,
      severity: rule.severity,
      priority: Number(rule.priority || 0),
      description: rule.description.trim() || null,
    }))

    const body = {
      ...(editing === 'create' ? { code: draft.code.trim() || undefined } : {}),
      name: draft.name.trim(),
      country: draft.country.trim().toUpperCase() || null,
      description: draft.description.trim() || null,
      effectiveFrom: draft.effectiveFrom,
      effectiveTo: draft.effectiveTo || null,
      rules,
    }

    setSaving(true)
    setError(null)
    try {
      const url = editing === 'revise' && selected
        ? `/api/compliance/rule-sets/${selected.id}`
        : '/api/compliance/rule-sets'
      const method = editing === 'revise' ? 'PUT' : 'POST'
      const saved = await requestJson<ComplianceRuleSetRecord>(url, { method, body: JSON.stringify(body) })
      setEditing(null)
      setShowAllVersions(false)
      await load()
      setSelectedId(saved.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule set')
    } finally {
      setSaving(false)
    }
  }

  async function archiveSelected() {
    if (!selected || !selected.isCurrent) return
    if (!window.confirm(`Archive ${selected.name} v${selected.version}? A new inactive version will preserve history.`)) return

    setSaving(true)
    setError(null)
    try {
      const archived = await requestJson<ComplianceRuleSetRecord>(`/api/compliance/rule-sets/${selected.id}`, { method: 'DELETE' })
      setShowAllVersions(false)
      await load()
      setSelectedId(archived.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive rule set')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-amber-500" />
            <h1 className="text-2xl font-bold tracking-tight">Compliance Rule Sets</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Versioned Ghana transport, shipper and fleet rules. Legal limits stay in data, not application code.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAllVersions((value) => !value)} className="cursor-pointer gap-2">
            <History className="h-4 w-4" />
            {showAllVersions ? 'Current Versions' : 'Version History'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading} className="cursor-pointer gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button type="button" size="sm" onClick={startCreate} className="cursor-pointer gap-2">
            <Plus className="h-4 w-4" />
            New Rule Set
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-2 p-3 text-sm text-red-700 dark:text-red-300">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {editing && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>{editing === 'create' ? 'Create Rule Set' : `Revise ${selected?.name ?? 'Rule Set'}`}</CardTitle>
                <CardDescription>
                  {editing === 'create'
                    ? 'Creates version 1 of a new rule-set family.'
                    : `Saves a new immutable version; version ${selected?.version ?? 0} remains in history.`}
                </CardDescription>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setEditing(null)} className="cursor-pointer">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Name</span>
                <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ghana General Haulage" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Code</span>
                <Input value={draft.code} disabled={editing === 'revise'} onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="ghana-general-haulage" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Country</span>
                <Input value={draft.country} onChange={(event) => setDraft({ ...draft, country: event.target.value })} placeholder="GH" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Effective From</span>
                <Input type="date" value={draft.effectiveFrom} onChange={(event) => setDraft({ ...draft, effectiveFrom: event.target.value })} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Effective To</span>
                <Input type="date" value={draft.effectiveTo} onChange={(event) => setDraft({ ...draft, effectiveTo: event.target.value })} />
              </label>
              <label className="space-y-1 text-sm md:col-span-3">
                <span className="font-medium">Description</span>
                <textarea className={textAreaClass} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Source, legal instrument or shipper policy notes" />
              </label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Rules</h3>
                  <p className="text-xs text-muted-foreground">Specific scopes override general scopes; equal precedence is rejected by the API.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, rules: [...draft.rules, emptyRule()] })} className="cursor-pointer gap-2">
                  <Plus className="h-4 w-4" /> Add Rule
                </Button>
              </div>

              {draft.rules.map((rule, index) => (
                <div key={index} className="rounded-lg border p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold">Rule {index + 1}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeRule(index)} disabled={draft.rules.length === 1} className="cursor-pointer text-muted-foreground hover:text-destructive">
                      <Trash2 className="mr-1 h-4 w-4" /> Remove
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="space-y-1 text-xs"><span className="font-medium">Type</span><input className={inputClass} value={rule.type} onChange={(event) => updateRule(index, { type: event.target.value })} placeholder="max_gross_weight" /></label>
                    <label className="space-y-1 text-xs"><span className="font-medium">Operator</span><select className={inputClass} value={rule.operator} onChange={(event) => updateRule(index, { operator: event.target.value })}><option value="lt">&lt;</option><option value="lte">≤</option><option value="gt">&gt;</option><option value="gte">≥</option><option value="eq">Equals</option><option value="neq">Not equal</option><option value="in">In list</option><option value="not_in">Not in list</option><option value="required">Required</option></select></label>
                    <label className="space-y-1 text-xs"><span className="font-medium">Value</span><input className={inputClass} value={rule.value} onChange={(event) => updateRule(index, { value: event.target.value })} placeholder="Configured value" /></label>
                    <label className="space-y-1 text-xs"><span className="font-medium">Unit</span><input className={inputClass} value={rule.unit} onChange={(event) => updateRule(index, { unit: event.target.value })} placeholder="kg, km/h, hours" /></label>
                    <label className="space-y-1 text-xs"><span className="font-medium">Severity</span><select className={inputClass} value={rule.severity} onChange={(event) => updateRule(index, { severity: event.target.value as 'blocking' | 'warning' })}><option value="blocking">Blocking</option><option value="warning">Warning</option></select></label>
                    <label className="space-y-1 text-xs"><span className="font-medium">Priority</span><input className={inputClass} type="number" value={rule.priority} onChange={(event) => updateRule(index, { priority: event.target.value })} /></label>
                    <label className="space-y-1 text-xs"><span className="font-medium">Scope Country</span><input className={inputClass} value={rule.scopeCountry} onChange={(event) => updateRule(index, { scopeCountry: event.target.value })} placeholder="GH" /></label>
                    <label className="space-y-1 text-xs"><span className="font-medium">Shipper</span><input className={inputClass} value={rule.shipperId} onChange={(event) => updateRule(index, { shipperId: event.target.value })} placeholder="Optional shipper ID" /></label>
                    <label className="space-y-1 text-xs"><span className="font-medium">Vehicle Type</span><input className={inputClass} value={rule.vehicleType} onChange={(event) => updateRule(index, { vehicleType: event.target.value })} /></label>
                    <label className="space-y-1 text-xs"><span className="font-medium">Trailer Type</span><input className={inputClass} value={rule.trailerType} onChange={(event) => updateRule(index, { trailerType: event.target.value })} /></label>
                    <label className="space-y-1 text-xs"><span className="font-medium">Commodity</span><input className={inputClass} value={rule.commodityId} onChange={(event) => updateRule(index, { commodityId: event.target.value })} /></label>
                    <label className="space-y-1 text-xs lg:col-span-3"><span className="font-medium">Rule Note</span><input className={inputClass} value={rule.description} onChange={(event) => updateRule(index, { description: event.target.value })} placeholder="Source or operational note" /></label>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)} className="cursor-pointer">Cancel</Button>
              <Button type="button" onClick={submitDraft} disabled={saving} className="cursor-pointer gap-2"><Save className="h-4 w-4" />{saving ? 'Saving…' : editing === 'create' ? 'Create Rule Set' : 'Save New Version'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.65fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Rule Sets</CardTitle>
            <CardDescription>{showAllVersions ? 'All immutable versions' : 'Current version of each rule family'}</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[650px] space-y-2 overflow-y-auto p-3 pt-0">
            {loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading rule sets…</div>
            ) : ruleSets.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No compliance rule sets yet.</div>
            ) : ruleSets.map((ruleSet) => (
              <button
                type="button"
                key={ruleSet.id}
                onClick={() => setSelectedId(ruleSet.id)}
                className={`w-full cursor-pointer rounded-lg border p-3 text-left transition hover:bg-muted/50 ${selectedId === ruleSet.id ? 'border-primary bg-primary/5' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{ruleSet.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{ruleSet.code}</p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">v{ruleSet.version}</Badge>
                  {ruleSet.isCurrent && <Badge>Current</Badge>}
                  <Badge variant={ruleSet.isActive ? 'secondary' : 'outline'}>{ruleSet.isActive ? 'Active' : 'Inactive'}</Badge>
                  <span className="text-xs text-muted-foreground">{ruleSet.rules.length} rules</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>{selected?.name ?? 'Select a rule set'}</CardTitle>
                <CardDescription>{selected ? `${selected.code} · version ${selected.version}` : 'Choose a rule set to inspect its rules.'}</CardDescription>
              </div>
              {selected?.isCurrent && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={startRevise} className="cursor-pointer gap-2"><SlidersHorizontal className="h-4 w-4" />Revise</Button>
                  <Button type="button" variant="outline" size="sm" onClick={archiveSelected} disabled={saving} className="cursor-pointer gap-2 text-destructive"><Archive className="h-4 w-4" />Archive</Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No rule set selected.</div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div><p className="text-xs text-muted-foreground">Country</p><p className="text-sm font-medium">{selected.country || 'All'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Effective From</p><p className="text-sm font-medium">{new Date(selected.effectiveFrom).toLocaleDateString('en-GB')}</p></div>
                  <div><p className="text-xs text-muted-foreground">Effective To</p><p className="text-sm font-medium">{selected.effectiveTo ? new Date(selected.effectiveTo).toLocaleDateString('en-GB') : 'Open-ended'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Status</p><p className="text-sm font-medium">{selected.isActive ? 'Active' : 'Inactive'}</p></div>
                </div>

                {selected.description && <p className="text-sm text-muted-foreground">{selected.description}</p>}

                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[780px] text-sm">
                    <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                      <tr><th className="px-3 py-2">Type</th><th className="px-3 py-2">Scope</th><th className="px-3 py-2">Rule</th><th className="px-3 py-2">Severity</th><th className="px-3 py-2">Priority</th></tr>
                    </thead>
                    <tbody>
                      {selected.rules.map((rule) => (
                        <tr key={rule.id} className="border-t align-top">
                          <td className="px-3 py-3 font-medium">{rule.type}</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">{JSON.stringify(scopeObject(rule.scope))}</td>
                          <td className="px-3 py-3"><span className="font-mono text-xs">{rule.operator} {displayValue(rule.value)} {rule.unit ?? ''}</span></td>
                          <td className="px-3 py-3"><Badge variant={rule.severity === 'blocking' ? 'destructive' : 'secondary'}>{rule.severity === 'blocking' ? 'Blocking' : 'Warning'}</Badge></td>
                          <td className="px-3 py-3 tabular-nums">{rule.priority}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default ComplianceRulesView
