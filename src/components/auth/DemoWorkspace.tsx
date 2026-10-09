'use client'

import * as React from 'react'
import {
  CheckCircle2,
  Eye,
  Layers3,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Sparkles,
  Truck,
  UserRound,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { APP_NAME } from '@/lib/constants'
import { useAuthStore } from '@/lib/store/auth'

interface DemoWorkspaceProps {
  profile?: string | null
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function readableDomains(permissions: string[] | undefined): string[] {
  const domains = new Set<string>()
  for (const permission of permissions ?? []) {
    if (!permission.endsWith('.view')) continue
    const [domain] = permission.split('.')
    if (domain) domains.add(domain)
  }
  return Array.from(domains).sort((a, b) => a.localeCompare(b))
}

export function DemoWorkspace(_props: DemoWorkspaceProps) {
  const { user, logout } = useAuthStore()
  const domains = React.useMemo(() => readableDomains(user?.permissions), [user?.permissions])
  const label = user?.demoLabel || user?.role || 'Configured preview'
  const description = user?.demoDescription || 'Explore the configured read-only product areas for this demo role.'
  const capability = user?.demoCapability || 'Role-based product preview'

  return (
    <div className="min-h-[100dvh] bg-[#07111d] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-32 h-96 w-96 rounded-full bg-amber-400/15 blur-[120px]" />
        <div className="absolute -bottom-40 right-0 h-[32rem] w-[32rem] rounded-full bg-cyan-400/10 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-black tracking-tight">{APP_NAME}</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
                Isolated product preview
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200">
              <ShieldCheck className="h-3.5 w-3.5" /> Demo Mode · Read Only
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={logout}
              className="h-9 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Exit demo</span>
            </Button>
          </div>
        </header>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.07] px-4 py-3 text-xs text-emerald-100">
          <div className="flex items-center gap-2 font-semibold">
            <LockKeyhole className="h-4 w-4 text-emerald-300" />
            Production APIs and customer records remain blocked
          </div>
          <div className="text-emerald-200/70">Configured role: {user?.role || 'Preview'}</div>
        </div>

        <section className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)] lg:items-end lg:py-14">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
              <Sparkles className="h-4 w-4" /> {capability}
            </div>
            <h1 className="max-w-4xl text-4xl font-black leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              {label}
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">{description}</p>
            {(user?.position || user?.department) && (
              <div className="mt-5 flex flex-wrap gap-2">
                {user.position && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
                    {user.position}
                  </span>
                )}
                {user.department && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
                    {user.department}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-6">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
              <ShieldCheck className="h-4 w-4 text-amber-300" /> Session boundaries
            </div>
            <div className="mt-5 space-y-3">
              <BoundaryRow icon={Eye} title="Product visibility" detail="Only configured read-only domains" />
              <BoundaryRow icon={LockKeyhole} title="Production writes" detail="Blocked centrally" />
              <BoundaryRow icon={UserRound} title="Identity" detail="Ephemeral demo session" />
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[.75fr_1.25fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 sm:p-6">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
              <Layers3 className="h-4 w-4 text-amber-300" /> Access summary
            </div>
            <div className="mt-6 text-4xl font-black tracking-tight">{domains.length}</div>
            <div className="mt-1 text-sm font-semibold text-slate-300">Readable product domains</div>
            <p className="mt-4 text-xs leading-6 text-slate-500">
              This number is derived from the role permissions issued by the server. No operational counts or customer data are embedded in the demo.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold">Configured read-only areas</div>
                <div className="mt-1 text-xs text-slate-500">Derived from this session&apos;s permission set</div>
              </div>
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
            </div>

            {domains.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {domains.map((domain) => (
                  <div
                    key={domain}
                    className="rounded-2xl border border-white/[0.08] bg-black/10 px-4 py-3 text-sm font-semibold text-slate-200"
                  >
                    {titleCase(domain)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
                No read-only product domains are configured for this preview role.
              </div>
            )}
          </div>
        </section>

        <footer className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-white/10 py-6 text-xs text-slate-500 sm:flex-row sm:items-center">
          <span>Public demo sessions are isolated from production operational data.</span>
          <span>Sign in with an authorized account for live operations.</span>
        </footer>
      </div>
    </div>
  )
}

function BoundaryRow({
  icon: Icon,
  title,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  detail: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-black/10 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-amber-300">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        <div className="mt-0.5 text-xs text-slate-500">{detail}</div>
      </div>
    </div>
  )
}
