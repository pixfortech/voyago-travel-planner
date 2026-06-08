'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Calendar, Users, Wallet, Compass, Lock, Camera, X, Clock,
} from 'lucide-react'
import { getShare } from '@/lib/firestore'
import {
  formatDate, tripTypeLabel, formatCurrency,
  activityTypeIcon, expenseCategoryIcon, vendorTypeIcon, vendorTypeLabel,
} from '@/lib/utils'
import type { SharedTripSnapshot, SharedMemory } from '@/types'

function groupMemoriesByDay(memories: SharedMemory[]): Array<{ dayKey: string; items: SharedMemory[] }> {
  const map = new Map<string, SharedMemory[]>()
  for (const m of memories) {
    const key = m.dayKey ?? m.uploadedAt.slice(0, 10)
    const arr = map.get(key) ?? []
    arr.push(m)
    map.set(key, arr)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dayKey, items]) => ({ dayKey, items }))
}

type LoadState = 'loading' | 'ready' | 'unavailable'

function Brand() {
  return (
    <Link href="/" className="inline-flex items-center gap-0.5 select-none">
      <span className="text-base font-black bg-gradient-to-r from-primary-600 to-teal-500 bg-clip-text text-transparent tracking-tight">
        Voya
      </span>
      <span className="text-base font-black text-gray-900 tracking-tight">GO</span>
    </Link>
  )
}

function NotAvailable() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-primary-50/40 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center mb-5">
        <Lock size={26} className="text-gray-300" />
      </div>
      <h1 className="text-xl font-black text-gray-900 mb-2">This link isn&apos;t available</h1>
      <p className="text-sm text-gray-500 max-w-sm mb-6 leading-relaxed">
        The trip you&apos;re looking for may have been unshared by its owner, or the
        link is incorrect or expired.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 bg-primary-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary-600 transition-colors"
      >
        <Compass size={16} /> Plan your own trip with VoyaGO
      </Link>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-black text-gray-900 mb-3">{children}</h2>
}

export default function SharedTripPage() {
  const { shareId } = useParams<{ shareId: string }>()
  const [state, setState] = useState<LoadState>('loading')
  const [snap, setSnap] = useState<SharedTripSnapshot | null>(null)
  const [lightboxMemory, setLightboxMemory] = useState<SharedMemory | null>(null)

  useEffect(() => {
    if (!shareId) return
    getShare(shareId)
      .then((share) => {
        if (share && share.enabled) {
          setSnap(share.snapshot)
          setState('ready')
        } else {
          setState('unavailable')
        }
      })
      .catch(() => setState('unavailable'))
  }, [shareId])

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (state === 'unavailable' || !snap) {
    return <NotAvailable />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
          <Brand />
          <span className="text-[11px] font-semibold text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
            Read-only
          </span>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto px-4 py-6 space-y-5"
      >
        {/* Hero */}
        <div
          className="rounded-2xl p-6 text-white relative overflow-hidden"
          style={{ backgroundColor: snap.coverColor }}
        >
          <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/10 pointer-events-none" />
          <div className="relative">
            <h1 className="text-2xl font-black leading-tight mb-1.5">{snap.name}</h1>
            <div className="flex items-center gap-1.5 text-white/80 mb-3">
              <MapPin size={14} />
              <span className="text-sm">{snap.destination}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-white/80 text-sm">
              <span className="flex items-center gap-1.5">
                <Calendar size={14} />
                {formatDate(snap.startDate)} – {formatDate(snap.endDate)}
              </span>
              <span>{snap.dayCount} {snap.dayCount === 1 ? 'day' : 'days'}</span>
              <span>{tripTypeLabel(snap.type)}</span>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm text-center">
            <p className="text-lg font-black text-gray-900">{snap.dayCount}</p>
            <p className="text-xs text-gray-400">Days</p>
          </div>
          <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm text-center">
            <p className="text-lg font-black text-gray-900">{snap.activityCount}</p>
            <p className="text-xs text-gray-400">Activities</p>
          </div>
          <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm text-center">
            <p className="text-lg font-black text-gray-900">
              {snap.travellerCount ?? '—'}
            </p>
            <p className="text-xs text-gray-400">Travellers</p>
          </div>
        </div>

        {/* Travellers */}
        {snap.travellers && snap.travellers.length > 0 && (
          <div>
            <SectionTitle>Travellers</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {snap.travellers.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1 text-white text-xs font-bold"
                  style={{ backgroundColor: t.color }}
                >
                  <span className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center text-[9px] font-black">
                    {t.initials}
                  </span>
                  {t.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Budget summary */}
        {snap.budget && (
          <div>
            <SectionTitle>Budget</SectionTitle>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 font-bold">Budget</p>
                  <p className="text-sm font-black text-gray-900 mt-0.5">
                    {formatCurrency(snap.budget.budget, snap.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 font-bold">Spent</p>
                  <p className="text-sm font-black text-gray-900 mt-0.5">
                    {formatCurrency(snap.budget.spent, snap.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 font-bold">
                    {snap.budget.remaining >= 0 ? 'Left' : 'Over'}
                  </p>
                  <p
                    className={`text-sm font-black mt-0.5 ${
                      snap.budget.remaining >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {formatCurrency(Math.abs(snap.budget.remaining), snap.currency)}
                  </p>
                </div>
              </div>
              {snap.budget.budget > 0 && (
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full"
                    style={{
                      width: `${Math.min((snap.budget.spent / snap.budget.budget) * 100, 100)}%`,
                    }}
                  />
                </div>
              )}
              {snap.budget.perHeadSpent > 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  {formatCurrency(snap.budget.perHeadSpent, snap.currency)} per person
                </p>
              )}
            </div>
          </div>
        )}

        {/* Expense breakdown */}
        {(snap.categoryBreakdown?.length || snap.vendorBreakdown?.length) && (
          <div>
            <SectionTitle>Spending breakdown</SectionTitle>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
              {snap.categoryBreakdown && snap.categoryBreakdown.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2">By category</p>
                  <div className="space-y-1.5">
                    {snap.categoryBreakdown.map((c) => (
                      <div key={c.category} className="flex items-center gap-2.5">
                        <span className="text-base">{expenseCategoryIcon(c.category)}</span>
                        <span className="text-sm text-gray-700 capitalize flex-1">{c.category}</span>
                        <span className="text-sm font-bold text-gray-900">
                          {formatCurrency(c.total, snap.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {snap.vendorBreakdown && snap.vendorBreakdown.length > 0 && (
                <div className="pt-1">
                  <p className="text-xs font-bold text-gray-500 mb-2">By vendor type</p>
                  <div className="space-y-1.5">
                    {snap.vendorBreakdown.map((v) => (
                      <div key={v.vendorType} className="flex items-center gap-2.5">
                        <span className="text-base">{vendorTypeIcon(v.vendorType)}</span>
                        <span className="text-sm text-gray-700 flex-1">
                          {vendorTypeLabel(v.vendorType)}
                        </span>
                        <span className="text-sm font-bold text-gray-900">
                          {formatCurrency(v.total, snap.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Settlement summary */}
        {snap.settlement && snap.settlement.length > 0 && (
          <div>
            <SectionTitle>Who owes whom</SectionTitle>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
              {snap.settlement.map((s, i) => (
                <div key={i} className="flex items-center gap-2 px-4 py-3">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
                    style={{ backgroundColor: s.fromColor }}
                  >
                    {s.fromName.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-700 truncate">{s.fromName}</span>
                  <span className="text-gray-300 text-xs">→</span>
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
                    style={{ backgroundColor: s.toColor }}
                  >
                    {s.toName.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-700 truncate flex-1">{s.toName}</span>
                  <span className="text-sm font-black text-gray-900 flex-shrink-0">
                    {formatCurrency(s.amount, snap.currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Itinerary */}
        {snap.itinerary && snap.itinerary.length > 0 && (
          <div>
            <SectionTitle>Itinerary</SectionTitle>
            <div className="space-y-3">
              {snap.itinerary.map((day) => (
                <div
                  key={day.dayNumber}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                >
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <div className="w-8 h-8 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-black text-primary-600">{day.dayNumber}</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">Day {day.dayNumber}</p>
                      <p className="text-xs text-gray-400">{formatDate(day.date)}</p>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {day.activities.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3">
                        <span className="text-lg flex-shrink-0">{activityTypeIcon(a.type)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                          {(a.time || a.notes) && (
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                              {a.time && <span>{a.time}</span>}
                              {a.time && a.notes && <span className="text-gray-200">·</span>}
                              {a.notes && <span className="truncate">{a.notes}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {snap.notes && (
          <div>
            <SectionTitle>Notes</SectionTitle>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {snap.notes}
              </p>
            </div>
          </div>
        )}

        {/* Memories gallery */}
        {snap.memories && snap.memories.length > 0 && (
          <div>
            <SectionTitle>
              Memories{snap.memoryCount ? ` (${snap.memoryCount})` : ''}
            </SectionTitle>
            <div className="space-y-3">
              {groupMemoriesByDay(snap.memories).map(({ dayKey, items }) => (
                <div
                  key={dayKey}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                >
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                    <Camera size={12} className="text-rose-400" />
                    <p className="text-xs font-bold text-gray-600">{formatDate(dayKey)}</p>
                    <span className="text-[10px] text-gray-400">{items.length} photo{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-2">
                    {items.map((m, i) => (
                      <button
                        key={i}
                        onClick={() => setLightboxMemory(m)}
                        className="relative rounded-xl overflow-hidden bg-gray-100 aspect-square cursor-pointer group"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.photoUrl}
                          alt={m.title || 'Memory'}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          onError={(e) => {
                            const el = e.target as HTMLImageElement
                            el.style.display = 'none'
                          }}
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 pointer-events-none">
                          {m.title && (
                            <p className="text-white text-[10px] font-bold truncate">{m.title}</p>
                          )}
                          {m.taggedTravellers && m.taggedTravellers.length > 0 && (
                            <div className="flex -space-x-1 mt-0.5">
                              {m.taggedTravellers.slice(0, 3).map((t, ti) => (
                                <span
                                  key={ti}
                                  className="w-4 h-4 rounded-full border border-white text-[7px] font-black flex items-center justify-center text-white"
                                  style={{ backgroundColor: t.color }}
                                  title={t.name}
                                >
                                  {t.initials}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer CTA */}
        <div className="pt-2 pb-8 text-center">
          <p className="text-xs text-gray-400 mb-3">Planned with VoyaGO</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-all"
          >
            <Compass size={16} className="text-primary-500" /> Plan your own trip
          </Link>
        </div>
      </motion.div>

      {/* Read-only memory lightbox */}
      <AnimatePresence>
        {lightboxMemory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setLightboxMemory(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl overflow-hidden max-w-lg w-full max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="relative bg-gray-900 flex items-center justify-center"
                style={{ minHeight: 200 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={lightboxMemory.photoUrl}
                  alt={lightboxMemory.title || 'Memory'}
                  className="max-h-[60vh] w-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.opacity = '0.3'
                  }}
                />
                <button
                  onClick={() => setLightboxMemory(null)}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 space-y-2 overflow-y-auto">
                {lightboxMemory.title && (
                  <p className="font-bold text-gray-900">{lightboxMemory.title}</p>
                )}
                {lightboxMemory.description && (
                  <p className="text-sm text-gray-600">{lightboxMemory.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                  {lightboxMemory.dayKey && (
                    <span className="flex items-center gap-1">
                      <Calendar size={11} /> {formatDate(lightboxMemory.dayKey)}
                    </span>
                  )}
                  {lightboxMemory.capturedAt && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {new Date(lightboxMemory.capturedAt).toLocaleTimeString('en-IN', {
                        hour: '2-digit', minute: '2-digit', hour12: true,
                      })}
                    </span>
                  )}
                  {lightboxMemory.placeName && (
                    <span className="flex items-center gap-1">
                      <MapPin size={11} /> {lightboxMemory.placeName}
                    </span>
                  )}
                </div>
                {lightboxMemory.taggedTravellers && lightboxMemory.taggedTravellers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {lightboxMemory.taggedTravellers.map((t, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 rounded-full pl-1 pr-2.5 py-0.5 text-white text-[11px] font-bold"
                        style={{ backgroundColor: t.color }}
                      >
                        <span className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[8px] font-black">
                          {t.initials}
                        </span>
                        {t.name}
                      </span>
                    ))}
                  </div>
                )}
                {/* No delete / edit / download controls on public share */}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
