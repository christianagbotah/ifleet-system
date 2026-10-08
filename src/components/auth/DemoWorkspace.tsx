'use client'

import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Crown,
  Fuel,
  Gauge,
  LogOut,
  MapPinned,
  RadioTower,
  Route,
  ShieldCheck,
  Sparkles,
  Truck,
  UserRound,
  WalletCards,
  Wrench,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { APP_NAME } from '@/lib/constants'
import type { DemoProfileId } from '@/lib/auth/demo-profiles'
import { useAuthStore } from '@/lib/store/auth'

type Metric = { label: string; value: string; note: string; icon: LucideIcon }
type ActivityItem = { title: string; meta: string; status: string }
type Workspace = {
  role: string
  eyebrow: string
  headline: string
  description: string
  accent: string
  metrics: Metric[]
  focus: string[]
  activity: ActivityItem[]
}

const SHARED_METRICS: Metric[] = [
  { label: 'Fleet visibility', value: '42 units', note: 'Synthetic connected fleet', icon: Truck },
  { label: 'Active movements', value: '18', note: 'Across Ghana corridors', icon: Route },
  { label: 'Compliance', value: '97.4%', note: 'Demo clearance score', icon: ShieldCheck },
  { label: 'Exceptions', value: '6', note: 'Awaiting review', icon: Activity },
]

const WORKSPACES: Record<DemoProfileId, Workspace> = {
  admin: {
    role: 'Administrator',
    eyebrow: 'Executive command',
    headline: 'One operating picture for the entire haulage business.',
    description: 'Preview governance, fleet health, dispatch performance and compliance from an administrator perspective.',
    accent: 'System-wide oversight',
    metrics: SHARED_METRICS,
    focus: ['Fleet command center', 'Compliance governance', 'Role & policy oversight', 'Executive reporting'],
    activity: [
      { title: 'Tema → Kumasi dispatch wave', meta: '8 loads · 7 cleared · 1 compliance hold', status: 'Review' },
      { title: 'Roadworthy renewals', meta: '3 units due in the next 30 days', status: 'Planned' },
      { title: 'Control tower health', meta: '39 of 42 units reporting normally', status: 'Healthy' },
    ],
  },
  manager: {
    role: 'Fleet Manager',
    eyebrow: 'Operations control',
    headline: 'Balance availability, safety and delivery performance.',
    description: 'Explore the decisions a fleet manager makes across assignment, exceptions, maintenance and corridor performance.',
    accent: 'Daily operations',
    metrics: [
      { label: 'Available tractors', value: '21', note: 'Ready for assignment', icon: Truck },
      { label: 'On-time dispatch', value: '94%', note: 'Synthetic 30-day trend', icon: Clock3 },
      { label: 'Fuel efficiency', value: '2.8 km/L', note: 'Fleet benchmark', icon: Fuel },
      { label: 'Safety holds', value: '2', note: 'Require manager action', icon: ShieldCheck },
    ],
    focus: ['Dispatch readiness', 'Fleet utilisation', 'Maintenance risk', 'Corridor performance'],
    activity: [
      { title: 'Truck GT-2045-26', meta: 'Assignment ready · Tema depot', status: 'Ready' },
      { title: 'Tamale corridor', meta: 'ETA variance +18 minutes', status: 'Watch' },
      { title: 'Workshop release', meta: '2 tractors returned to service', status: 'Cleared' },
    ],
  },
  dispatcher: {
    role: 'Dispatcher',
    eyebrow: 'Dispatch desk',
    headline: 'Turn approved loads into safe, traceable movements.',
    description: 'Preview load allocation, driver/tractor readiness, gate clearance and departure sequencing.',
    accent: 'Load execution',
    metrics: [
      { label: 'Open loads', value: '14', note: 'Synthetic load board', icon: ClipboardCheck },
      { label: 'Assigned today', value: '9', note: 'Driver + tractor paired', icon: UserRound },
      { label: 'At loading sites', value: '5', note: 'Queue / weighing / gate', icon: MapPinned },
      { label: 'Departure holds', value: '1', note: 'Compliance evidence missing', icon: ShieldCheck },
    ],
    focus: ['Load board', 'Assignment eligibility', 'Factory queue', 'Dispatch clearance'],
    activity: [
      { title: 'LD-260108-014', meta: 'GHACEM Tema → Suame · 600 bags', status: 'Assigned' },
      { title: 'LD-260108-011', meta: 'Gross weighing complete · seal pending', status: 'Hold' },
      { title: 'LD-260108-009', meta: 'Electronic waybill finalised', status: 'Clear' },
    ],
  },
  driver: {
    role: 'Driver',
    eyebrow: 'Driver workspace',
    headline: 'Everything needed for the next safe movement—nothing extra.',
    description: 'Preview a simplified driver experience for assignment, route, evidence and trip progress.',
    accent: 'My trip',
    metrics: [
      { label: 'Current assignment', value: 'Tema → Kumasi', note: 'Synthetic trip DEMO-018', icon: Route },
      { label: 'Distance', value: '247 km', note: 'Planned corridor', icon: MapPinned },
      { label: 'Checklist', value: '8 / 8', note: 'Pre-departure complete', icon: CheckCircle2 },
      { label: 'ETA', value: '16:40', note: 'Demo route estimate', icon: Clock3 },
    ],
    focus: ['Assigned trip', 'Safety checklist', 'Route guidance', 'Delivery evidence'],
    activity: [
      { title: 'Vehicle inspection', meta: 'All required checks completed', status: 'Passed' },
      { title: 'Waybill DEMO-WB-018', meta: 'Verified · seal DEMO-8831', status: 'Ready' },
      { title: 'Next milestone', meta: 'Gate-out after dispatcher clearance', status: 'Waiting' },
    ],
  },
  mechanic: {
    role: 'Mechanic',
    eyebrow: 'Workshop view',
    headline: 'Prioritise maintenance before it becomes downtime.',
    description: 'Preview workshop workload, inspection findings, vehicle health and release readiness.',
    accent: 'Maintenance intelligence',
    metrics: [
      { label: 'Open work orders', value: '7', note: 'Synthetic workshop queue', icon: Wrench },
      { label: 'Critical defects', value: '1', note: 'Vehicle held from dispatch', icon: ShieldCheck },
      { label: 'Due services', value: '4', note: 'Next 14 days', icon: Clock3 },
      { label: 'Fleet health', value: '92%', note: 'Demo health index', icon: Gauge },
    ],
    focus: ['Workshop queue', 'Inspections', 'Service planning', 'Release to operations'],
    activity: [
      { title: 'GT-8821-25', meta: 'Brake chamber replacement', status: 'In progress' },
      { title: 'GT-1108-24', meta: '30,000 km service completed', status: 'Release' },
      { title: 'TR-044', meta: 'Trailer light defect recorded', status: 'Queued' },
    ],
  },
  accountant: {
    role: 'Accountant',
    eyebrow: 'Finance view',
    headline: 'Understand the commercial flow without exposing real company data.',
    description: 'This public demo uses synthetic amounts to illustrate invoicing, expense review and settlement workflows.',
    accent: 'Synthetic finance',
    metrics: [
      { label: 'Demo invoiced', value: '₵184,600', note: 'Synthetic current month', icon: WalletCards },
      { label: 'Demo expenses', value: '₵71,240', note: 'Synthetic approved spend', icon: BarChart3 },
      { label: 'Pending review', value: '6', note: 'Synthetic expense items', icon: ClipboardCheck },
      { label: 'Settlement status', value: '92%', note: 'Synthetic cleared value', icon: CheckCircle2 },
    ],
    focus: ['Invoices', 'Expense review', 'Driver settlements', 'Management reporting'],
    activity: [
      { title: 'INV-DEMO-1042', meta: 'Synthetic haulage invoice · ₵18,900', status: 'Issued' },
      { title: 'Expense batch DEMO-28', meta: '4 items awaiting approval', status: 'Review' },
      { title: 'Driver settlement', meta: 'Synthetic weekly batch prepared', status: 'Ready' },
    ],
  },
}

function resolveProfile(value: string | null | undefined): DemoProfileId {
  if (value && value in WORKSPACES) return value as DemoProfileId
  return 'manager'
}

export function DemoWorkspace() {
  const { user, logout } = useAuthStore()
  const profile = resolveProfile(user?.demoProfile)
  const workspace = WORKSPACES[profile]

  return (
    <div className="min-h-[100dvh] bg-[#07111d] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-32 h-96 w-96 rounded-full bg-amber-400/15 blur-[120px]" />
        <div className="absolute -bottom-40 right-0 h-[32rem] w-[32rem] rounded-full bg-cyan-400/10 blur-[140px]" />
        <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      </div>

      <div className="relative mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-black tracking-tight">{APP_NAME}</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">Public role preview</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200">
              <ShieldCheck className="h-3.5 w-3.5" /> Demo Mode · Read Only
            </div>
            <Button type="button" variant="outline" onClick={logout} className="h-9 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
              <LogOut className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Exit demo</span>
            </Button>
          </div>
        </header>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.07] px-4 py-3 text-xs text-emerald-100">
          <div className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-emerald-300" /> Synthetic demo data · No production records shown</div>
          <div className="text-emerald-200/70">Session role: {workspace.role}</div>
        </div>

        <section className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)] lg:items-end lg:py-14">
          <div>
            <div className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-amber-300">{workspace.eyebrow}</div>
            <h1 className="max-w-4xl text-4xl font-black leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">{workspace.headline}</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">{workspace.description}</p>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-5 backdrop-blur-xl sm:p-6">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-slate-400"><RadioTower className="h-4 w-4 text-amber-300" /> {workspace.accent}</div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {workspace.focus.map((item) => <div key={item} className="rounded-xl border border-white/10 bg-black/10 px-3 py-3 text-xs font-semibold text-slate-200">{item}</div>)}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {workspace.metrics.map(({ label, value, note, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-xl sm:p-5">
              <div className="flex items-center justify-between"><Icon className="h-4 w-4 text-amber-300" /><span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Sample</span></div>
              <div className="mt-6 text-xl font-black tracking-tight sm:text-2xl">{value}</div>
              <div className="mt-1 text-xs font-semibold text-slate-300">{label}</div>
              <div className="mt-1 text-[11px] text-slate-500">{note}</div>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div><div className="text-sm font-bold">Role activity preview</div><div className="mt-1 text-xs text-slate-500">Synthetic workflow examples for {workspace.role}</div></div>
              <Activity className="h-5 w-5 text-amber-300" />
            </div>
            <div className="space-y-2">
              {workspace.activity.map((item) => (
                <div key={item.title} className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-black/10 px-4 py-3">
                  <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-100">{item.title}</div><div className="mt-1 truncate text-xs text-slate-500">{item.meta}</div></div>
                  <div className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-200">{item.status}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-amber-300/15 bg-gradient-to-br from-amber-300/10 to-white/[0.035] p-5 sm:p-6">
            <Crown className="h-5 w-5 text-amber-300" />
            <h2 className="mt-5 text-xl font-black">Want the full operational workspace?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">Public demo sessions are intentionally isolated from production APIs. Sign in with an authorised company account to use live fleet data and operational actions.</p>
            <Button type="button" onClick={logout} className="mt-6 h-11 w-full bg-amber-400 font-bold text-slate-950 hover:bg-amber-300">
              Return to sign in <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
