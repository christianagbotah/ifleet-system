'use client'

import { APP_COPYRIGHT, APP_NAME } from '@/lib/constants'
import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  MapPinned,
  Navigation,
  RadioTower,
  Route,
  ShieldCheck,
  Sparkles,
  Truck,
} from 'lucide-react'
import { toast } from 'sonner'

import { DemoLoginPanel } from '@/components/auth/DemoLoginPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/lib/store/auth'

// ── Auth view states ──
type AuthView = 'login' | 'forgot-password' | 'reset-password' | 'reset-success'

export function LoginView() {
  const [view, setView] = React.useState<AuthView>('login')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const { login, isLoading } = useAuthStore()

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!email.trim()) {
      toast.error('Please enter your email')
      return
    }
    if (!password.trim()) {
      toast.error('Please enter your password')
      return
    }

    try {
      await login(email.trim(), password.trim())
      toast.success('Welcome back!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Login failed')
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#07111d]">
      <div className="pointer-events-none absolute inset-0 lg:hidden">
        <div className="absolute -left-24 -top-32 h-80 w-80 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="absolute -bottom-40 right-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <main className="relative mx-auto grid min-h-[100dvh] w-full max-w-[1680px] lg:grid-cols-[minmax(0,1.08fr)_minmax(500px,0.92fr)]">
        <LoginShowcase />

        <section className="relative flex min-h-[100dvh] items-center justify-center bg-white px-4 py-8 dark:bg-[#0b111a] sm:px-8 lg:px-10 xl:px-16">
          <div className="w-full max-w-[560px]">
            <div className="mb-7 flex items-center justify-between lg:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-base font-bold tracking-tight text-slate-950 dark:text-white">{APP_NAME}</div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">Fleet intelligence</div>
                </div>
              </div>
              <span className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:border-white/10 dark:text-slate-400">Ghana</span>
            </div>

            <AnimatePresence mode="wait">
              {view === 'login' && (
                <LoginForm
                  key="login"
                  email={email}
                  setEmail={setEmail}
                  password={password}
                  setPassword={setPassword}
                  showPassword={showPassword}
                  setShowPassword={setShowPassword}
                  isLoading={isLoading}
                  onSubmit={handleLoginSubmit}
                  onForgotPassword={() => {
                    setView('forgot-password')
                    setPassword('')
                  }}
                />
              )}

              {view === 'forgot-password' && (
                <ForgotPasswordForm
                  key="forgot"
                  email={email}
                  setEmail={setEmail}
                  onBack={() => setView('login')}
                  onTokenSent={(returnedEmail) => {
                    setEmail(returnedEmail)
                    setView('reset-password')
                  }}
                />
              )}

              {view === 'reset-password' && (
                <ResetPasswordForm
                  key="reset"
                  email={email}
                  onBack={() => setView('forgot-password')}
                  onSuccess={() => setView('reset-success')}
                />
              )}

              {view === 'reset-success' && (
                <ResetSuccessView
                  key="success"
                  onBackToLogin={() => {
                    setView('login')
                    setPassword('')
                  }}
                />
              )}
            </AnimatePresence>

            <div className="mt-7 flex flex-col items-center justify-between gap-2 text-center text-[11px] text-slate-400 sm:flex-row sm:text-left">
              <span>{APP_COPYRIGHT}</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Secure fleet operations</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function LoginShowcase() {
  return (
    <aside className="relative hidden min-h-[100dvh] overflow-hidden bg-[#07111d] px-10 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-14">
      <div className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
      <div className="pointer-events-none absolute -left-20 top-24 h-80 w-80 rounded-full bg-amber-500/20 blur-[110px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-cyan-400/10 blur-[130px]" />

      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-400 text-slate-950 shadow-[0_12px_40px_-12px_rgba(245,158,11,0.7)]">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-black tracking-tight">{APP_NAME}</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">African haulage operating system</div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/5 px-3 py-1.5 text-[11px] font-semibold text-emerald-200">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" /> Platform online
        </div>
      </div>

      <div className="relative z-10 my-10 max-w-3xl">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3.5 py-2 text-xs font-semibold text-amber-200">
          <Sparkles className="h-3.5 w-3.5" /> Fleet intelligence · Ghana haulage OS
        </div>
        <h1 className="max-w-2xl text-5xl font-black leading-[1.02] tracking-[-0.045em] xl:text-6xl">
          Command every vehicle. <span className="text-amber-400">See every risk.</span> Move every load.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 xl:text-lg">
          One intelligent control layer for dispatch, factory loading, compliance, weighing, live fleet visibility and commercial performance.
        </p>

        <div className="mt-8 grid max-w-2xl grid-cols-3 gap-3">
          {[{ icon: RadioTower, value: 'Live', label: 'Control tower' }, { icon: ShieldCheck, value: 'Guarded', label: 'Compliance' }, { icon: Activity, value: 'Unified', label: 'Operations data' }].map(({ icon: Icon, value, label }) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4 backdrop-blur-xl">
              <Icon className="mb-5 h-5 w-5 text-amber-300" />
              <div className="text-sm font-bold">{value}</div>
              <div className="mt-1 text-xs text-slate-400">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 rounded-[28px] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/20 backdrop-blur-2xl xl:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400"><MapPinned className="h-4 w-4 text-amber-300" /> Active movement</div>
            <div className="mt-2 text-lg font-bold">Tema Port → Kumasi</div>
            <div className="mt-1 text-xs text-slate-400">Haulage corridor · live operations preview</div>
          </div>
          <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/10 px-3 py-2 text-right">
            <div className="text-xs font-bold text-emerald-200">On route</div>
            <div className="mt-0.5 text-[10px] text-emerald-200/70">Telemetry healthy</div>
          </div>
        </div>

        <div className="relative my-7 h-20">
          <div className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-amber-400 via-amber-300/70 to-cyan-300/60" />
          <div className="absolute left-3 top-1/2 -translate-y-1/2"><div className="h-3 w-3 rounded-full bg-amber-400 shadow-[0_0_0_6px_rgba(245,158,11,0.12)]" /><span className="absolute left-0 top-5 whitespace-nowrap text-[10px] text-slate-400">Tema</span></div>
          <div className="absolute left-[56%] top-1/2 -translate-x-1/2 -translate-y-1/2"><div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-300/30 bg-[#111d2b] text-amber-300 shadow-xl"><Truck className="h-5 w-5" /></div></div>
          <div className="absolute right-3 top-1/2 -translate-y-1/2"><div className="h-3 w-3 rounded-full border-2 border-cyan-300 bg-[#07111d] shadow-[0_0_0_6px_rgba(103,232,249,0.08)]" /><span className="absolute right-0 top-5 whitespace-nowrap text-[10px] text-slate-400">Kumasi</span></div>
        </div>

        <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
          <div><div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-slate-500"><Navigation className="h-3 w-3" /> ETA</div><div className="mt-1 text-sm font-semibold">2h 18m</div></div>
          <div><div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-slate-500"><Route className="h-3 w-3" /> Corridor</div><div className="mt-1 text-sm font-semibold">Clear</div></div>
          <div><div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-slate-500"><ShieldCheck className="h-3 w-3" /> Compliance</div><div className="mt-1 text-sm font-semibold">Passed</div></div>
        </div>
      </div>
    </aside>
  )
}

function LoginForm({
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  isLoading,
  onSubmit,
  onForgotPassword,
}: {
  email: string
  setEmail: (v: string) => void
  password: string
  setPassword: (v: string) => void
  showPassword: boolean
  setShowPassword: (v: boolean) => void
  isLoading: boolean
  onSubmit: (e: React.FormEvent) => void
  onForgotPassword: () => void
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}>
      <div className="rounded-[30px] border border-slate-200/90 bg-white p-5 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-white/[0.035] sm:p-8">
        <div className="mb-7">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Secure workspace
          </div>
          <h2 className="text-3xl font-black tracking-[-0.035em] text-slate-950 dark:text-white sm:text-[34px]">Welcome back</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Sign in to your intelligent fleet command center.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Email address</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input id="login-email" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} autoComplete="email" className="h-12 rounded-xl border-slate-200 bg-slate-50 pl-10 text-sm shadow-none transition focus-visible:border-amber-400 focus-visible:ring-amber-400/20 dark:border-white/10 dark:bg-white/[0.045]" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="login-password" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Password</Label>
              <button type="button" onClick={onForgotPassword} className="text-xs font-semibold text-amber-600 transition-colors hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300">Forgot password?</button>
            </div>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input id="login-password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} autoComplete="current-password" className="h-12 rounded-xl border-slate-200 bg-slate-50 pl-10 pr-11 text-sm shadow-none transition focus-visible:border-amber-400 focus-visible:ring-amber-400/20 dark:border-white/10 dark:bg-white/[0.045]" />
              <button type="button" className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="h-12 w-full rounded-xl bg-amber-500 font-bold text-slate-950 shadow-[0_12px_28px_-14px_rgba(245,158,11,0.85)] hover:bg-amber-400" disabled={isLoading}>
            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…</> : 'Sign in to iFleetPro'}
          </Button>
        </form>

        <DemoLoginPanel />
      </div>
    </motion.div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Forgot Password Form (Step 1: enter email)
// ──────────────────────────────────────────────────────────────────────────────

function ForgotPasswordForm({
  email,
  setEmail,
  onBack,
  onTokenSent,
}: {
  email: string
  setEmail: (v: string) => void
  onBack: () => void
  onTokenSent: (email: string) => void
}) {
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [devToken, setDevToken] = React.useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!email.trim()) {
      toast.error('Please enter your email address')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })

      const data = await res.json()

      if (res.ok) {
        toast.success(data.message || 'Reset link sent! Check your email.')
        // In dev mode, capture the token for convenience
        if (data.devToken) {
          setDevToken(data.devToken)
        }
        onTokenSent(email.trim())
      } else {
        toast.error(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      toast.error('Network error. Please check your connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="rounded-[28px] border border-slate-200/90 bg-white shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-white/[0.035]">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-2 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30">
            <Mail className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <CardTitle className="text-xl">Forgot Password</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a reset link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email Address</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="you@fleetpro.com.gh"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                autoComplete="email"
                className="h-11"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-semibold"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </Button>
          </form>

          {/* Dev mode: show token for testing */}
          {devToken && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
                  <p className="font-medium">Dev Mode — Reset Token</p>
                  <p className="font-mono text-[11px] break-all select-all bg-white dark:bg-gray-900 px-2 py-1 rounded border border-amber-200 dark:border-amber-800">
                    {devToken.slice(0, 8)}
                  </p>
                  <p className="text-[11px] opacity-70">Use the 8-char code above or the full token to reset.</p>
                </div>
              </div>
            </div>
          )}

          {/* Back to login */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign In
            </button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Reset Password Form (Step 2: enter token + new password)
// ──────────────────────────────────────────────────────────────────────────────

function ResetPasswordForm({
  email,
  onBack,
  onSuccess,
}: {
  email: string
  onBack: () => void
  onSuccess: () => void
}) {
  const [token, setToken] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [showNewPassword, setShowNewPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isVerifying, setIsVerifying] = React.useState(false)
  const [tokenStatus, setTokenStatus] = React.useState<'idle' | 'valid' | 'invalid'>('idle')
  const [tokenEmail, setTokenEmail] = React.useState<string | null>(null)

  // Debounced token verification
  const verifyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
    }
  }, [])

  function handleTokenChange(value: string) {
    setToken(value)
    setTokenStatus('idle')
    setTokenEmail(null)

    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)

    const trimmed = value.trim()
    if (trimmed.length >= 4) {
      verifyTimerRef.current = setTimeout(async () => {
        setIsVerifying(true)
        try {
          const res = await fetch(
            `/api/auth/verify-reset-token?token=${encodeURIComponent(trimmed)}`
          )
          const data = await res.json()
          if (data.valid) {
            setTokenStatus('valid')
            setTokenEmail(data.user?.email ?? null)
          } else {
            setTokenStatus('invalid')
          }
        } catch {
          // ignore verification errors
        } finally {
          setIsVerifying(false)
        }
      }, 500)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!token.trim()) {
      toast.error('Please enter the reset code')
      return
    }

    if (!newPassword) {
      toast.error('Please enter a new password')
      return
    }

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.trim(),
          newPassword,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        toast.success('Password reset successfully!')
        onSuccess()
      } else {
        toast.error(data.error || 'Failed to reset password')
      }
    } catch {
      toast.error('Network error. Please check your connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="rounded-[28px] border border-slate-200/90 bg-white shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-white/[0.035]">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-2 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30">
            <KeyRound className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <CardTitle className="text-xl">Reset Password</CardTitle>
          <CardDescription>
            Enter the code sent to <span className="font-medium text-foreground">{email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Token / Code input */}
            <div className="space-y-2">
              <Label htmlFor="reset-token">Reset Code</Label>
              <div className="relative">
                <Input
                  id="reset-token"
                  type="text"
                  placeholder="Enter 8-char code or full token"
                  value={token}
                  onChange={(e) => handleTokenChange(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="one-time-code"
                  className="h-11 pr-10 font-mono text-sm"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isVerifying && (
                    <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                  )}
                  {tokenStatus === 'valid' && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  )}
                  {tokenStatus === 'invalid' && token.length >= 4 && !isVerifying && (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
              {tokenEmail && tokenStatus === 'valid' && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Valid code for {tokenEmail}
                </p>
              )}
            </div>

            {/* New password */}
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="new-password"
                  className="h-11 pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-11 w-11 px-3 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  tabIndex={-1}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {newPassword && newPassword.length < 8 && (
                <p className="text-xs text-red-500">Password must be at least 8 characters</p>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="new-password"
                  className="h-11 pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-11 w-11 px-3 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-500">Passwords do not match</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-semibold"
              disabled={isSubmitting || !token.trim() || !newPassword || newPassword !== confirmPassword || newPassword.length < 8}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting Password...
                </>
              ) : (
                'Reset Password'
              )}
            </Button>
          </form>

          {/* Resend link */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Didn&apos;t get the code? Try again
            </button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Reset Success View
// ──────────────────────────────────────────────────────────────────────────────

function ResetSuccessView({
  onBackToLogin,
}: {
  onBackToLogin: () => void
}) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="rounded-[28px] border border-slate-200/90 bg-white shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-white/[0.035]">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="mx-auto mb-4 inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-50 mb-2">
            Password Reset Successfully
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            Your password has been updated. You can now sign in with your new password.
          </p>
          <Button
            onClick={onBackToLogin}
            className="h-11 font-semibold px-8"
          >
            Sign In Now
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}
