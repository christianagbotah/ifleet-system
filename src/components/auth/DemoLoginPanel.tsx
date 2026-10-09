'use client'

import * as React from 'react'
import { ShieldCheck, UserRound } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import type { PublicDemoProfile } from '@/lib/auth/demo-runtime-config'
import { useAuthStore } from '@/lib/store/auth'

interface DemoProfilesResponse {
  enabled: boolean
  profiles: PublicDemoProfile[]
}

export function DemoLoginPanel() {
  const [profiles, setProfiles] = React.useState<PublicDemoProfile[]>([])
  const [selected, setSelected] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState<string | null>(null)
  const { demoLogin, isLoading } = useAuthStore()

  const active = React.useMemo(
    () => profiles.find((profile) => profile.key === selected) ?? profiles[0] ?? null,
    [profiles, selected],
  )

  React.useEffect(() => {
    let cancelled = false

    fetch('/api/auth/demo-login')
      .then(async (response) => {
        if (!response.ok) return { enabled: false, profiles: [] } as DemoProfilesResponse
        return response.json() as Promise<DemoProfilesResponse>
      })
      .then((data) => {
        if (cancelled || data.enabled !== true || !Array.isArray(data.profiles)) return
        const safeProfiles = data.profiles.filter(
          (profile): profile is PublicDemoProfile => Boolean(profile?.key && profile?.label && profile?.role),
        )
        setProfiles(safeProfiles)
        setSelected((current) => current ?? safeProfiles[0]?.key ?? null)
      })
      .catch(() => {
        if (!cancelled) {
          setProfiles([])
          setSelected(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (!active || profiles.length === 0) return null

  async function continueAsDemo() {
    if (!active) return
    setPending(active.key)
    try {
      await demoLogin(active.key)
      toast.success(`${active.label} demo ready`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Demo login failed')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="mt-6 border-t border-slate-200/80 pt-5 dark:border-white/10">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
            <ShieldCheck className="h-4 w-4 text-amber-500" />
            Explore iFleetPro
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Choose an available preview role and enter an isolated read-only demo session.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
          Read only
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {profiles.map((profile) => {
          const isSelected = profile.key === active.key
          return (
            <button
              key={profile.key}
              type="button"
              onClick={() => setSelected(profile.key)}
              className={`group rounded-2xl border p-3 text-left transition-all duration-200 ${
                isSelected
                  ? 'border-amber-400 bg-amber-50 shadow-[0_8px_24px_-16px_rgba(245,158,11,0.9)] dark:border-amber-400/70 dark:bg-amber-400/10'
                  : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20'
              }`}
              aria-pressed={isSelected}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${isSelected ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>
                  <UserRound className="h-4 w-4" />
                </span>
                {isSelected && <span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.12)]" />}
              </div>
              <div className="mt-3 text-xs font-semibold text-slate-900 dark:text-slate-100">{profile.label}</div>
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">
                {profile.capability || profile.role}
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-3 rounded-2xl bg-slate-50 px-3.5 py-3 dark:bg-white/[0.04]">
        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{active.label}</div>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {active.description || `Read-only preview for the ${active.role} role.`}
        </p>
      </div>

      <Button
        type="button"
        onClick={continueAsDemo}
        disabled={isLoading || pending !== null}
        className="mt-3 h-11 w-full rounded-xl bg-slate-950 font-semibold text-white shadow-lg shadow-slate-950/10 hover:bg-slate-800 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400"
      >
        {pending ? 'Opening demo workspace…' : `Continue as ${active.label}`}
      </Button>
    </div>
  )
}
