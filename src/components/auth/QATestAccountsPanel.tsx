'use client'

import * as React from 'react'
import { FlaskConical, ShieldCheck, UserRound } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PublicQaProfile } from '@/lib/auth/qa-runtime-config'
import { useAuthStore } from '@/lib/store/auth'

interface QaProfilesResponse {
  enabled: boolean
  profiles: PublicQaProfile[]
}

export function QATestAccountsPanel() {
  const [profiles, setProfiles] = React.useState<PublicQaProfile[]>([])
  const [selected, setSelected] = React.useState<string | null>(null)
  const [accessCode, setAccessCode] = React.useState('')
  const [pending, setPending] = React.useState<string | null>(null)
  const { qaLogin, isLoading } = useAuthStore()

  const active = React.useMemo(
    () => profiles.find((profile) => profile.key === selected) ?? profiles[0] ?? null,
    [profiles, selected],
  )

  React.useEffect(() => {
    let cancelled = false

    fetch('/api/auth/qa-login', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return { enabled: false, profiles: [] } as QaProfilesResponse
        return response.json() as Promise<QaProfilesResponse>
      })
      .then((data) => {
        if (cancelled || data.enabled !== true || !Array.isArray(data.profiles)) return
        const safeProfiles = data.profiles.filter(
          (profile): profile is PublicQaProfile => Boolean(profile?.key && profile?.label && profile?.role),
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

  async function continueAsQa() {
    if (!active) return
    const trimmedAccessCode = accessCode.trim()
    if (!trimmedAccessCode) {
      toast.error('Enter the QA access code to continue')
      return
    }

    setPending(active.key)
    try {
      await qaLogin(active.key, trimmedAccessCode)
      const user = useAuthStore.getState().user
      if (user?.role === 'Driver') window.location.assign('/driver')
      toast.success(`${active.label} test workspace ready`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Test account login failed')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="mt-6 border-t border-slate-200/80 pt-5 dark:border-white/10">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
            <FlaskConical className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            Test Accounts
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Sign in as a real QA user with the selected role&apos;s actual permissions and workflows.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-300">
          Full QA
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
                  ? 'border-cyan-400 bg-cyan-50 shadow-[0_8px_24px_-16px_rgba(8,145,178,0.9)] dark:border-cyan-400/70 dark:bg-cyan-400/10'
                  : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20'
              }`}
              aria-pressed={isSelected}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${isSelected ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>
                  <UserRound className="h-4 w-4" />
                </span>
                {isSelected && <span className="h-2 w-2 rounded-full bg-cyan-500 shadow-[0_0_0_4px_rgba(6,182,212,0.12)]" />}
              </div>
              <div className="mt-3 text-xs font-semibold text-slate-900 dark:text-slate-100">{profile.label}</div>
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">
                {profile.capability || profile.role}
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-3 rounded-2xl bg-cyan-50/70 px-3.5 py-3 dark:bg-cyan-400/[0.06]">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
          <ShieldCheck className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
          {active.label} · {active.role}
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {active.description || `Full QA access using the real ${active.role} role and its configured permissions.`}
        </p>
      </div>

      <div className="mt-3 space-y-1.5">
        <label
          htmlFor="qa-access-code"
          className="text-xs font-semibold text-slate-700 dark:text-slate-300"
        >
          QA access code
        </label>
        <Input
          id="qa-access-code"
          type="password"
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && accessCode.trim() && pending === null) {
              void continueAsQa()
            }
          }}
          placeholder="Enter testing access code"
          autoComplete="off"
          className="h-11 rounded-xl"
        />
        <p className="text-[11px] leading-4 text-slate-400">
          This code unlocks the full QA roles; it is not an account password.
        </p>
      </div>

      <Button
        type="button"
        onClick={continueAsQa}
        disabled={isLoading || pending !== null || !accessCode.trim()}
        className="mt-3 h-11 w-full rounded-xl bg-cyan-700 font-semibold text-white shadow-lg shadow-cyan-950/10 hover:bg-cyan-600 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
      >
        {pending ? 'Opening test workspace…' : `Login as ${active.label}`}
      </Button>
    </div>
  )
}
