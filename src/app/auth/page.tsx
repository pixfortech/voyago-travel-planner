'use client'

import { type FormEvent, Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader, Sparkles } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import type { AuthResult } from '@/lib/auth'

/** Only allow relative paths that start with '/' to prevent open-redirect. */
function safeReturnUrl(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  return raw
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

type Mode = 'signup' | 'signin'

function AuthPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnUrl = safeReturnUrl(searchParams.get('returnUrl'))

  const { user, isAnonymous, signInWithGoogle, signUpWithEmail, signInWithEmail } = useApp()

  const [mode, setMode] = useState<Mode>('signup')
  const [busy, setBusy] = useState<'google' | 'email' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Already signed in → go to returnUrl or dashboard
  useEffect(() => {
    if (user && !user.isAnonymous) {
      router.replace(returnUrl)
    }
  }, [user, router, returnUrl])

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
  }

  async function handleGoogle() {
    setBusy('google')
    setError(null)
    const result: AuthResult = await signInWithGoogle()
    setBusy(null)
    if (result.success) {
      router.replace(returnUrl)
    } else if (result.error !== 'popup-closed') {
      setError(result.errorMessage ?? 'Sign in failed.')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return

    if (mode === 'signup' && !name.trim()) {
      setError('Please enter your name.')
      return
    }

    setBusy('email')
    setError(null)

    let result: AuthResult
    if (mode === 'signup') {
      result = await signUpWithEmail(name.trim(), email.trim(), password)
    } else {
      result = await signInWithEmail(email.trim(), password)
    }

    setBusy(null)

    if (result.success) {
      router.replace(returnUrl)
    } else {
      setError(result.errorMessage ?? 'Something went wrong.')
      // If "email already in use" on signup, nudge them to sign in
      if (result.error === 'email-already-in-use') {
        switchMode('signin')
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-teal-50 flex flex-col items-center justify-center p-4">

      {/* Logo */}
      <Link href="/" className="flex items-center gap-0.5 mb-8 select-none">
        <span className="text-2xl font-black bg-gradient-to-r from-primary-600 to-teal-500 bg-clip-text text-transparent tracking-tight">
          Voya
        </span>
        <span className="text-2xl font-black text-gray-900 tracking-tight">GO</span>
      </Link>

      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-gray-200/60 border border-gray-100 overflow-hidden">
        {/* Anonymous upgrade banner */}
        {isAnonymous && (
          <div className="flex items-start gap-2.5 bg-amber-50 border-b border-amber-100 px-6 py-4">
            <Sparkles size={15} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              <span className="font-bold">Your trips are saved locally.</span>{' '}
              Sign in to access them from any device and never lose your data.
            </p>
          </div>
        )}

        <div className="p-8">
          {/* Heading */}
          <div className="mb-6">
            <h1 className="text-2xl font-black text-gray-900">
              {mode === 'signup' ? 'Create account' : 'Welcome back'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {mode === 'signup'
                ? 'Start planning your next adventure.'
                : 'Sign in to access your trips.'}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 leading-snug">
              {error}
            </div>
          )}

          {/* Google button */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy !== null}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-all disabled:opacity-60 disabled:pointer-events-none mb-4"
          >
            {busy === 'google' ? (
              <Loader size={18} className="animate-spin text-gray-400" />
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </button>

          {/* Or divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400 font-medium">or</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Email form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <Input
                id="name"
                label="Your name"
                placeholder="E.g. Arjun Mehta"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            )}
            <Input
              id="email"
              type="email"
              label="Email address"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <Input
              id="password"
              type="password"
              label="Password"
              placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
            />

            <Button
              type="submit"
              size="lg"
              className="w-full mt-1"
              disabled={busy !== null}
            >
              {busy === 'email' ? (
                <Loader size={16} className="animate-spin" />
              ) : mode === 'signup' ? (
                'Create account'
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          {/* Mode toggle */}
          <p className="text-center text-sm text-gray-500 mt-5">
            {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <button
              type="button"
              onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
              className="text-primary-600 font-semibold hover:text-primary-700 transition-colors"
            >
              {mode === 'signup' ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </div>
      </div>

      {/* Continue as guest */}
      <Link
        href="/dashboard"
        className="mt-6 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        Continue as guest →
      </Link>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-teal-50 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
        </div>
      }
    >
      <AuthPageInner />
    </Suspense>
  )
}
