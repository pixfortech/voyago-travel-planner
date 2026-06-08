'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Link2, Copy, Check, RefreshCw, Eye, Globe, Lock, ExternalLink,
  Map, Users, Wallet, PieChart, ArrowLeftRight, FileText, AlertTriangle, Camera,
} from 'lucide-react'
import {
  getTrip, getItineraryDays, getExpenses, getShare, saveShare, deleteShare, getMemories,
} from '@/lib/firestore'
import { buildSnapshot, DEFAULT_VISIBILITY, generateShareToken } from '@/lib/share'
import AppShell from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui/Skeleton'
import type {
  Trip, ItineraryDay, Expense, ShareVisibility, ShareMemoryVisibility, TripMemory,
} from '@/types'

// Explicit union avoids including non-boolean keys (memoryOptions) in toggle logic
type VisKey = 'itinerary' | 'travellers' | 'budget' | 'expenseBreakdown' | 'settlement' | 'notes' | 'memories'

interface ToggleRow {
  key: VisKey
  label: string
  description: string
  icon: React.ReactNode
  sensitive?: boolean
  confirmMessage?: string
}

const TOGGLES: ToggleRow[] = [
  { key: 'itinerary', label: 'Itinerary', description: 'Day-by-day plan and activities', icon: <Map size={16} /> },
  { key: 'travellers', label: 'Traveller list', description: 'Names and avatars of who is going', icon: <Users size={16} /> },
  { key: 'budget', label: 'Budget summary', description: 'Total budget, spent and remaining', icon: <Wallet size={16} />, sensitive: true },
  { key: 'expenseBreakdown', label: 'Expense breakdown', description: 'Category and vendor-wise spend', icon: <PieChart size={16} />, sensitive: true },
  { key: 'settlement', label: 'Settlement summary', description: 'Who owes whom after the trip', icon: <ArrowLeftRight size={16} />, sensitive: true },
  { key: 'notes', label: 'Notes', description: 'Your free-text trip notes', icon: <FileText size={16} /> },
  {
    key: 'memories',
    label: 'Memories',
    description: 'Trip photos in a read-only gallery',
    icon: <Camera size={16} />,
    sensitive: true,
    confirmMessage:
      'Heads up: enabling this makes trip photos visible to ANYONE with the share link. ' +
      'GPS coordinates are never included in the public view. Continue?',
  },
]

export default function ShareSettingsPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [memories, setMemories] = useState<TripMemory[]>([])
  const [loading, setLoading] = useState(true)

  const [enabled, setEnabled] = useState(false)
  const [visibility, setVisibility] = useState<ShareVisibility>(DEFAULT_VISIBILITY)
  const [shareId, setShareId] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!tripId) return
    Promise.all([
      getTrip(tripId), getItineraryDays(tripId), getExpenses(tripId), getMemories(tripId),
    ]).then(async ([t, d, e, m]) => {
      if (!t) { router.push('/dashboard'); return }
      setTrip(t)
      setDays(d)
      setExpenses(e)
      setMemories(m)
      if (t.shareId) {
        const share = await getShare(t.shareId)
        if (share) {
          setShareId(share.id)
          setEnabled(share.enabled)
          setVisibility({ ...DEFAULT_VISIBILITY, ...share.visibility })
        }
      }
      setLoading(false)
    })
  }, [tripId, router])

  const shareUrl =
    shareId && typeof window !== 'undefined'
      ? `${window.location.origin}/share/${shareId}`
      : ''

  // Persist the current enabled/visibility state to Firestore, rebuilding the
  // public snapshot from the latest trip/expenses/days/memories.
  async function persist(nextEnabled: boolean, nextVisibility: ShareVisibility, id?: string) {
    if (!trip) return
    setSaving(true)
    try {
      const snapshot = buildSnapshot(trip, expenses, days, nextVisibility, memories)
      const usedId = await saveShare(trip, snapshot, {
        enabled: nextEnabled,
        visibility: nextVisibility,
        shareId: id ?? shareId,
      })
      setShareId(usedId)
      setTrip((prev) => (prev ? { ...prev, shareId: usedId } : prev))
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleEnabled() {
    const next = !enabled
    setEnabled(next)
    await persist(next, visibility)
  }

  async function handleToggleVisibility(key: VisKey, sensitive?: boolean, confirmMessage?: string) {
    const turningOn = !visibility[key]
    if (turningOn && sensitive) {
      const ok = window.confirm(
        confirmMessage ??
        'Heads up: enabling this makes financial details visible to ANYONE with the share link. ' +
        'Only share with people you trust. Continue?'
      )
      if (!ok) return
    }
    const next = { ...visibility, [key]: turningOn }
    setVisibility(next)
    // Only persist if a share already exists; otherwise it saves once enabled.
    if (shareId) await persist(enabled, next)
  }

  async function handleToggleMemoryOption(key: keyof ShareMemoryVisibility) {
    const currentOpts = visibility.memoryOptions ?? DEFAULT_VISIBILITY.memoryOptions!
    const newOpts = { ...currentOpts, [key]: !currentOpts[key] }
    const newVis: ShareVisibility = { ...visibility, memoryOptions: newOpts }
    setVisibility(newVis)
    if (shareId) await persist(enabled, newVis)
  }

  async function handleRegenerate() {
    if (!trip) return
    const ok = window.confirm(
      'Regenerate the link? The current link will stop working immediately and a new one will be created.'
    )
    if (!ok) return
    const oldId = shareId
    const newId = generateShareToken()
    await persist(enabled, visibility, newId)
    if (oldId && oldId !== newId) await deleteShare(oldId)
  }

  async function handleCopy() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API blocked — select-fallback not critical; ignore silently.
    }
  }

  if (loading) {
    return (
      <AppShell title="Share" back={`/trips/${tripId}`} tripId={tripId}>
        <div className="space-y-4 max-w-2xl">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </AppShell>
    )
  }

  if (!trip) return null

  const anySensitiveOn = visibility.budget || visibility.expenseBreakdown || visibility.settlement

  return (
    <AppShell title="Share" back={`/trips/${tripId}`} tripId={tripId}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4 max-w-2xl"
      >
        {/* Header */}
        <div>
          <h1 className="text-xl font-black text-gray-900">Share this trip</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create a read-only link so friends and family can view your plan. They
            can&apos;t edit anything.
          </p>
        </div>

        {/* Enable toggle card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-4">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                enabled ? 'bg-primary-50 text-primary-600' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {enabled ? <Globe size={20} /> : <Lock size={20} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900">
                {enabled ? 'Link sharing is on' : 'Link sharing is off'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {enabled
                  ? 'Anyone with the link can view the enabled sections.'
                  : 'Only you can see this trip right now.'}
              </p>
            </div>
            {/* Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Toggle link sharing"
              onClick={handleToggleEnabled}
              disabled={saving}
              className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                enabled ? 'bg-primary-500' : 'bg-gray-200'
              }`}
            >
              <span
                className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Link row */}
          {enabled && shareUrl && (
            <div className="mt-4 pt-4 border-t border-gray-50">
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 min-w-0">
                  <Link2 size={15} className="text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-600 truncate">{shareUrl}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors flex-shrink-0 ${
                    copied
                      ? 'bg-green-50 text-green-600'
                      : 'bg-primary-500 text-white hover:bg-primary-600'
                  }`}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="flex items-center justify-between mt-3">
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-primary-600 transition-colors"
                >
                  <ExternalLink size={13} /> Preview shared page
                </a>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-amber-600 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={13} /> Regenerate link
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Visibility controls */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
            <Eye size={15} className="text-gray-400" />
            <p className="text-sm font-bold text-gray-700">What viewers can see</p>
          </div>

          <div className="divide-y divide-gray-50">
            {TOGGLES.map((row) => {
              const on = visibility[row.key]
              return (
                <div key={row.key} className="flex items-center gap-3 px-5 py-3.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      on ? 'bg-primary-50 text-primary-600' : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {row.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-gray-900">{row.label}</p>
                      {row.sensitive && (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                          Financial
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{row.description}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`Toggle ${row.label}`}
                    onClick={() => handleToggleVisibility(row.key, row.sensitive, row.confirmMessage)}
                    disabled={saving}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                      on ? 'bg-primary-500' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        on ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )
            })}
          </div>

          {/* Memory content sub-options — shown only when memories is enabled */}
          {visibility.memories && (
            <div className="bg-rose-50/40 border-t border-rose-100 px-5 py-3.5">
              <p className="text-xs font-bold text-rose-700 mb-2.5">What to show in public memories</p>
              <div className="space-y-2">
                {(
                  [
                    { key: 'titles', label: 'Photo titles & descriptions' },
                    { key: 'tags', label: 'Tagged traveller names' },
                    { key: 'dayGrouping', label: 'Group photos by day' },
                  ] as Array<{ key: keyof ShareMemoryVisibility; label: string }>
                ).map((opt) => {
                  const on = (visibility.memoryOptions ?? DEFAULT_VISIBILITY.memoryOptions!)[opt.key]
                  return (
                    <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => handleToggleMemoryOption(opt.key)}
                        disabled={saving}
                        className="w-4 h-4 rounded accent-rose-500 disabled:opacity-50"
                      />
                      <span className="text-xs text-rose-800">{opt.label}</span>
                    </label>
                  )
                })}
              </div>
              <p className="text-[10px] text-rose-600 mt-2">
                GPS coordinates are never included in the public view.
              </p>
            </div>
          )}

          {/* Privacy warning when any financial section is on */}
          {anySensitiveOn && (
            <div className="flex items-start gap-2.5 bg-amber-50 border-t border-amber-100 px-5 py-3.5">
              <AlertTriangle size={15} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <span className="font-bold">Financial details are visible.</span> Anyone with the
                link can see budget and settlement amounts. Traveller email addresses are never
                shared.
              </p>
            </div>
          )}

          {/* Privacy warning when memories are enabled */}
          {visibility.memories && (
            <div className="flex items-start gap-2.5 bg-rose-50 border-t border-rose-100 px-5 py-3.5">
              <AlertTriangle size={15} className="text-rose-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-rose-800 leading-relaxed">
                <span className="font-bold">Photos are publicly visible.</span> Anyone with the
                link can view trip photos. GPS location data is never included.{' '}
                {memories.length === 0 && (
                  <span className="italic">Add memories to your trip first, then re-save share settings.</span>
                )}
              </p>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center px-4">
          The shared page shows a snapshot from the last time you changed these
          settings. Re-open this page to refresh it after editing your trip.
        </p>
      </motion.div>
    </AppShell>
  )
}
