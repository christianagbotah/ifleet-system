'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Layers3,
  Loader2,
  Mail,
  RadioTower,
  Route,
  ShieldCheck,
  Sparkles,
  Truck,
  Weight,
} from 'lucide-react'
import { toast } from 'sonner'

import { DemoLoginPanel } from '@/components/auth/DemoLoginPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { APP_COPYRIGHT, APP_NAME } from '@/lib/constants'
import { useAuthStore } from '@/lib/store/auth'

type AuthView = 'login' | 'forgot-password' | 'reset-password' | 'reset-success'

const PANEL_CLASS = 'rounded-[30px] border border-slate-200/90 bg-white p-5 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-white/[0.035] sm:p-8'

export function LoginView() {
  const [view, setView] = React.useState<AuthView>('login')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const { login, isLoading } = useAuthStore()

  async function handleLoginSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!email.trim()) {
      toast.error('Please enter your email')
      return
    }
    if (!password.trim()) {
      toast.error('Please enter your password')
      return
    }

    try {
      await login(email.trim(), password)
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

      <main className="relative mx-auto grid min-h-[100dvh] w-full max-w-[1680px] lg:grid-cols-[minmax(0,1.08fr)_minmax(500px,.92fr)]">
        <LoginShowcase />

        <section className="relative flex min-h-[100dvh] items-center justify-center bg-white px-4 py-8 dark:bg-[#0b111a] sm:px-8 lg:px-10 xl:px-16">
          <div className="w-full max-w-[560px]">
            <MobileBrand />

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
                    setPassword('')
                    setView('forgot-password')
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
                    setPassword('')
                    setView('login')
                  }}
                />
              )}
            </AnimatePresence>

            <div className="mt-7 flex flex-col items-center justify-between gap-2 text-center text-[11px] text-slate-400 sm:flex-row sm:text-left">
              <span>{APP_COPYRIGHT}</span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Secure fleet operations
              </span>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function MobileBrand() {
  return (
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
      <span className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:border-white/10 dark:text-slate-400">
        Ghana
      </span>
    </div>
  )
}

function LoginShowcase() {
  const workflow = [
    { icon: Layers3, title: 'Plan', detail: 'Orders, assets and assignments' },
    { icon: Weight, title: 'Verify', detail: 'Gate, weighing and compliance' },
    { icon: RadioTower, title: 'Move', detail: 'Tracking and control-tower visibility' },
    { icon: Route, title: 'Close', detail: 'Delivery evidence and reconciliation' },
  ]

  return (
    <aside className="relative hidden min-h-[100dvh] overflow-hidden bg-[#07111d] px-10 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-14">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />
      <div className="pointer-events-none absolute -left-20 top-24 h-80 w-80 rounded-full bg-amber-500/20 blur-[110px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-cyan-400/10 blur-[130px]" />

      <div className="relative z-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-400 text-slate-950 shadow-[0_12px_40px_-12px_rgba(245,158,11,.7)]">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-black tracking-tight">{APP_NAME}</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">African haulage operating system</div>
          </div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-slate-300">
          Production-ready architecture
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
          One intelligent operating layer for dispatch, factory loading, compliance, weighing, fleet visibility and commercial control.
        </p>

        <div className="mt-9 grid max-w-2xl grid-cols-2 gap-3 xl:grid-cols-4">
          {workflow.map(({ icon: Icon, title, detail }, index) => (
            <div key={title} className="relative rounded-2xl border border-white/10 bg-white/[0.055] p-4 backdrop-blur-xl">
              <div className="mb-6 flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[10px] font-bold tracking-[0.16em] text-slate-600">0{index + 1}</span>
              </div>
              <div className="text-sm font-bold">{title}</div>
              <div className="mt-1 text-xs leading-5 text-slate-400">{detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 rounded-[28px] border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/20 backdrop-blur-2xl">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
          <ShieldCheck className="h-4 w-4 text-amber-300" /> Operating model
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <ShowcasePoint title="Evidence first" detail="Every critical movement is backed by auditable operational evidence." />
          <ShowcasePoint title="Rules driven" detail="Compliance and dispatch decisions come from versioned configuration." />
          <ShowcasePoint title="Hardware neutral" detail="Telematics integrations remain provider-independent by design." />
        </div>
      </div>
    </aside>
  )
}

function ShowcasePoint({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/10 p-4">
      <CheckCircle2 className="h-4 w-4 text-emerald-300" />
      <div className="mt-4 text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{detail}</div>
    </div>
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
  setEmail: (value: string) => void
  password: string
  setPassword: (value: string) => void
  showPassword: boolean
  setShowPassword: (value: boolean) => void
  isLoading: boolean
  onSubmit: (event: React.FormEvent) => void
  onForgotPassword: () => void
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}>
      <div className={PANEL_CLASS}>
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
              <Input
                id="login-email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isLoading}
                autoComplete="email"
                className="h-12 rounded-xl border-slate-200 bg-slate-50 pl-10 text-sm shadow-none transition focus-visible:border-amber-400 focus-visible:ring-amber-400/20 dark:border-white/10 dark:bg-white/[0.045]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="login-password" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Password</Label>
              <button type="button" onClick={onForgotPassword} className="text-xs font-semibold text-amber-600 transition-colors hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300">
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isLoading}
                autoComplete="current-password"
                className="h-12 rounded-xl border-slate-200 bg-slate-50 pl-10 pr-11 text-sm shadow-none transition focus-visible:border-amber-400 focus-visible:ring-amber-400/20 dark:border-white/10 dark:bg-white/[0.045]"
              />
              <button
                type="button"
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="h-12 w-full rounded-xl bg-amber-500 font-bold text-slate-950 shadow-[0_12px_28px_-14px_rgba(245,158,11,.85)] hover:bg-amber-400" disabled={isLoading}>
            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…</> : 'Sign in to iFleetPro'}
          </Button>
        </form>

        <DemoLoginPanel />
      </div>
    </motion.div>
  )
}

function ForgotPasswordForm({
  email,
  setEmail,
  onBack,
  onTokenSent,
}: {
  email: string
  setEmail: (value: string) => void
  onBack: () => void
  onTokenSent: (email: string) => void
}) {
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!email.trim()) {
      toast.error('Please enter your email address')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Unable to start password recovery')
        return
      }
      toast.success(data.message || 'Password recovery instructions sent')
      onTokenSent(email.trim())
    } catch {
      toast.error('Network error. Please check your connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPanel icon={Mail} title="Recover access" description="Enter your account email to continue securely.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="forgot-email">Email address</Label>
          <Input
            id="forgot-email"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSubmitting}
            autoComplete="email"
            className="h-12 rounded-xl"
          />
        </div>
        <Button type="submit" className="h-12 w-full rounded-xl font-semibold" disabled={isSubmitting}>
          {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : 'Send recovery instructions'}
        </Button>
      </form>
      <BackButton onClick={onBack}>Back to sign in</BackButton>
    </AuthPanel>
  )
}

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
  const verifyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => () => {
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
  }, [])

  function handleTokenChange(value: string) {
    setToken(value)
    setTokenStatus('idle')
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)

    const trimmed = value.trim()
    if (trimmed.length < 4) return

    verifyTimerRef.current = setTimeout(async () => {
      setIsVerifying(true)
      try {
        const response = await fetch(`/api/auth/verify-reset-token?token=${encodeURIComponent(trimmed)}`)
        const data = await response.json()
        setTokenStatus(data.valid ? 'valid' : 'invalid')
      } catch {
        setTokenStatus('idle')
      } finally {
        setIsVerifying(false)
      }
    }, 500)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!token.trim()) {
      toast.error('Please enter the reset code')
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
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), newPassword }),
      })
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Failed to reset password')
        return
      }
      toast.success('Password reset successfully')
      onSuccess()
    } catch {
      toast.error('Network error. Please check your connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPanel icon={KeyRound} title="Set a new password" description={`Complete password recovery for ${email || 'your account'}.`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="reset-token">Reset code</Label>
          <div className="relative">
            <Input
              id="reset-token"
              value={token}
              onChange={(event) => handleTokenChange(event.target.value)}
              disabled={isSubmitting}
              autoComplete="one-time-code"
              placeholder="Enter your reset code"
              className="h-12 pr-10 font-mono"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {isVerifying && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
              {tokenStatus === 'valid' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              {tokenStatus === 'invalid' && !isVerifying && <span className="text-xs font-bold text-red-500">×</span>}
            </div>
          </div>
        </div>

        <PasswordField
          id="new-password"
          label="New password"
          value={newPassword}
          setValue={setNewPassword}
          show={showNewPassword}
          setShow={setShowNewPassword}
          disabled={isSubmitting}
          autoComplete="new-password"
        />
        <PasswordField
          id="confirm-password"
          label="Confirm password"
          value={confirmPassword}
          setValue={setConfirmPassword}
          show={showConfirmPassword}
          setShow={setShowConfirmPassword}
          disabled={isSubmitting}
          autoComplete="new-password"
        />

        <Button
          type="submit"
          className="h-12 w-full rounded-xl font-semibold"
          disabled={isSubmitting || !token.trim() || newPassword.length < 8 || newPassword !== confirmPassword}
        >
          {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating…</> : 'Update password'}
        </Button>
      </form>
      <BackButton onClick={onBack}>Request another code</BackButton>
    </AuthPanel>
  )
}

function PasswordField({
  id,
  label,
  value,
  setValue,
  show,
  setShow,
  disabled,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  setValue: (value: string) => void
  show: boolean
  setShow: (value: boolean) => void
  disabled: boolean
  autoComplete: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={disabled}
          autoComplete={autoComplete}
          placeholder="At least 8 characters"
          className="h-12 pr-11"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

function ResetSuccessView({ onBackToLogin }: { onBackToLogin: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <div className={`${PANEL_CLASS} text-center`}>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950 dark:text-white">Password updated</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
          Your credentials have been changed successfully. Sign in with your new password.
        </p>
        <Button onClick={onBackToLogin} className="mt-6 h-12 rounded-xl px-8 font-semibold">Return to sign in</Button>
      </div>
    </motion.div>
  )
}

function AuthPanel({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.22 }}>
      <div className={PANEL_CLASS}>
        <div className="mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
            <Icon className="h-5 w-5" />
          </div>
          <h2 className="mt-5 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        {children}
      </div>
    </motion.div>
  )
}

function BackButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
      <ArrowLeft className="h-4 w-4" /> {children}
    </button>
  )
}
