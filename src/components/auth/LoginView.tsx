'use client'
import { APP_COPYRIGHT, APP_NAME } from '@/lib/constants'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Truck,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Mail,
  KeyRound,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/lib/store/auth'
import { toast } from 'sonner'

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-amber-200/30 dark:bg-amber-900/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-orange-200/30 dark:bg-orange-900/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/25 mb-4">
            <Truck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">{APP_NAME}</h1>
          <p className="text-sm text-muted-foreground mt-1">Ghana Fleet Management System</p>
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

        <p className="text-center text-xs text-muted-foreground mt-6">
          {APP_COPYRIGHT}
        </p>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Login Form
// ──────────────────────────────────────────────────────────────────────────────

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
    <motion.div
      initial={false}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="shadow-xl border-0 shadow-gray-200/50 dark:shadow-gray-900/50">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl">Sign In</CardTitle>
          <CardDescription>
            Enter your credentials to access the dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email Address</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="you@fleetpro.com.gh"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                autoComplete="email"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="h-11 pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-11 w-11 px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-semibold"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          {/* Forgot Password link */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-sm text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 font-medium transition-colors"
            >
              Forgot Password?
            </button>
          </div>

          {/* Demo credentials hint - development only */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
                  <p className="font-medium">Demo Accounts</p>
                  <div className="grid grid-cols-1 gap-1 mt-1">
                    <p><span className="font-medium">Admin:</span> admin@fleetpro.com.gh / admin123</p>
                    <p><span className="font-medium">Manager:</span> manager@fleetpro.com.gh / manager123</p>
                    <p><span className="font-medium">Driver:</span> driver1@fleetpro.com.gh / driver123</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
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
      <Card className="shadow-xl border-0 shadow-gray-200/50 dark:shadow-gray-900/50">
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
      <Card className="shadow-xl border-0 shadow-gray-200/50 dark:shadow-gray-900/50">
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
      <Card className="shadow-xl border-0 shadow-gray-200/50 dark:shadow-gray-900/50">
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
