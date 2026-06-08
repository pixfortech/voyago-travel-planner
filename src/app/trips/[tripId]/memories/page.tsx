'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ImagePlus, Camera, MapPin, Navigation, Trash2, X, Loader2,
  AlertTriangle, Calendar, Tag, Link2, CheckCircle2, Clock, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import {
  getTrip, getItineraryDays, getLocationPoints, getMemories, addMemory, deleteMemory,
} from '@/lib/firestore'
import {
  uploadMemoryPhoto, isAcceptedImage, IMAGE_ACCEPT_ATTR, MAX_IMAGE_BYTES,
} from '@/lib/memories/storage'
import { getCurrentPosition, GeoError } from '@/lib/location/geo'
import { generateId } from '@/lib/utils'
import AppShell from '@/components/layout/AppShell'
import type {
  Trip, ItineraryDay, Activity, TripLocationPoint, TripMemory, Traveller, MemoryLocation, LocationSource,
} from '@/types'

// ── helpers ──────────────────────────────────────────────────────────────

function formatTime(iso?: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function groupByDay(memories: TripMemory[]): Array<{ dayKey: string; items: TripMemory[] }> {
  const map = new Map<string, TripMemory[]>()
  for (const m of memories) {
    const key = m.dayKey ?? (m.capturedAt ?? m.uploadedAt).slice(0, 10)
    const arr = map.get(key) ?? []
    arr.push(m)
    map.set(key, arr)
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dayKey, items]) => ({ dayKey, items }))
}

// ── component ─────────────────────────────────────────────────────────────

export default function MemoriesPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()
  const { user } = useApp()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [locationPoints, setLocationPoints] = useState<TripLocationPoint[]>([])
  const [memories, setMemories] = useState<TripMemory[]>([])
  const [loading, setLoading] = useState(true)

  // upload form
  const [showForm, setShowForm] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dayKey, setDayKey] = useState('')
  const [taggedIds, setTaggedIds] = useState<Set<string>>(new Set())
  const [linkedActivityId, setLinkedActivityId] = useState('')
  const [linkedLocationPointId, setLinkedLocationPointId] = useState('')
  const [placeName, setPlaceName] = useState('')
  const [memLocation, setMemLocation] = useState<MemoryLocation | null>(null)
  const [gpsBusy, setGpsBusy] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)

  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [formError, setFormError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // gallery
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [lightbox, setLightbox] = useState<TripMemory | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!tripId) return
    Promise.all([
      getTrip(tripId), getItineraryDays(tripId), getLocationPoints(tripId), getMemories(tripId),
    ]).then(([t, d, lp, m]) => {
      if (!t) { router.push('/dashboard'); return }
      setTrip(t)
      setDays(d)
      setLocationPoints(lp)
      setMemories(m)
      const first = m[0]?.dayKey ?? (m[0] ? (m[0].capturedAt ?? m[0].uploadedAt).slice(0, 10) : undefined)
      if (first) setExpandedDays(new Set([first]))
      // default the day picker to the trip start date
      setDayKey(t.startDate)
      setLoading(false)
    })
  }, [tripId, router])

  // clean up object URLs
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }
  }, [previewUrl])

  const travellers: Traveller[] = trip?.travellers ?? []

  // ── file selection ───────────────────────────────────────────────────

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0]
    if (!chosen) return
    setFormError(null)
    if (!isAcceptedImage(chosen)) {
      setFormError('Unsupported file type. Please choose a JPEG, PNG, WebP, or HEIC image.')
      return
    }
    if (chosen.size > MAX_IMAGE_BYTES) {
      setFormError('Image is too large (max 15 MB).')
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(chosen)
    // HEIC may not render; the <img> onError handler shows a fallback.
    setPreviewUrl(URL.createObjectURL(chosen))
    setShowForm(true)
  }

  function resetForm() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setTitle('')
    setDescription('')
    setTaggedIds(new Set())
    setLinkedActivityId('')
    setLinkedLocationPointId('')
    setPlaceName('')
    setMemLocation(null)
    setGpsError(null)
    setProgress(0)
    setFormError(null)
    setShowForm(false)
    if (trip) setDayKey(trip.startDate)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function toggleTag(id: string) {
    setTaggedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── attach current GPS (user-triggered only) ──────────────────────────

  async function handleUseCurrentLocation() {
    setGpsBusy(true)
    setGpsError(null)
    try {
      const pos = await getCurrentPosition()
      setMemLocation({
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy: pos.accuracy,
        capturedAt: new Date(pos.timestamp).toISOString(),
        source: 'manual_checkin' as LocationSource,
      })
    } catch (err) {
      setGpsError((err as GeoError).message)
    } finally {
      setGpsBusy(false)
    }
  }

  // When linking to a saved location point, reuse its coordinates.
  function handleLinkLocationPoint(id: string) {
    setLinkedLocationPointId(id)
    const pt = locationPoints.find((p) => p.id === id)
    if (pt) {
      setMemLocation({
        latitude: pt.latitude,
        longitude: pt.longitude,
        accuracy: pt.accuracy,
        capturedAt: pt.capturedAt,
        source: pt.source,
      })
      if (pt.label && !placeName) setPlaceName(pt.label)
    }
  }

  // ── upload ────────────────────────────────────────────────────────────

  async function handleUpload() {
    if (!user || !tripId || !file) return
    setUploading(true)
    setProgress(0)
    setFormError(null)
    try {
      const memoryId = generateId()
      const uploaded = await uploadMemoryPhoto(tripId, memoryId, file, setProgress)
      const now = new Date().toISOString()
      const data: Omit<TripMemory, 'id' | 'createdAt'> = {
        tripId,
        userId: user.uid,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        photoUrl: uploaded.photoUrl,
        storagePath: uploaded.storagePath,
        originalFileName: uploaded.originalFileName,
        contentType: uploaded.contentType,
        sizeBytes: uploaded.sizeBytes,
        uploadedAt: now,
        capturedAt: now,
        dayKey: dayKey || now.slice(0, 10),
        location: memLocation ?? undefined,
        placeName: placeName.trim() || undefined,
        taggedTravellerIds: taggedIds.size > 0 ? Array.from(taggedIds) : undefined,
        linkedActivityId: linkedActivityId || undefined,
        linkedLocationPointId: linkedLocationPointId || undefined,
      }
      const saved = await addMemory(tripId, data)
      setMemories((prev) => [saved, ...prev])
      const key = saved.dayKey ?? now.slice(0, 10)
      setExpandedDays((prev) => { const next = new Set(prev); next.add(key); return next })
      resetForm()
    } catch {
      setFormError('Upload failed. Please check your connection and try again.')
    } finally {
      setUploading(false)
    }
  }

  // ── delete ────────────────────────────────────────────────────────────

  async function handleDelete(memory: TripMemory) {
    if (!confirm('Delete this memory? This removes the photo permanently.')) return
    setDeletingId(memory.id)
    try {
      await deleteMemory(tripId, memory)
      setMemories((prev) => prev.filter((m) => m.id !== memory.id))
      if (lightbox?.id === memory.id) setLightbox(null)
    } finally {
      setDeletingId(null)
    }
  }

  // ── derived ───────────────────────────────────────────────────────────

  const allActivities: Array<{ id: string; title: string }> = days.flatMap((d) =>
    d.activities.map((a: Activity) => ({ id: a.id, title: a.title }))
  )
  const groups = groupByDay(memories)

  function travellerById(id: string) {
    return travellers.find((t) => t.id === id)
  }

  if (loading) {
    return (
      <AppShell title="Memories" back={`/trips/${tripId}`} tripId={tripId}>
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Memories" back={`/trips/${tripId}`} tripId={tripId}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

        {/* Summary + add */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Trip memories</p>
            <p className="text-2xl font-black text-gray-900 mt-0.5">{memories.length}</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-gradient-to-br from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white text-sm font-bold rounded-xl px-4 py-2.5 shadow-sm shadow-rose-500/20 transition-all"
          >
            <ImagePlus size={16} />
            Add memory
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_ACCEPT_ATTR}
            onChange={handleFileChosen}
            className="hidden"
          />
        </div>

        {formError && !showForm && (
          <div className="flex items-start gap-2 bg-red-50 text-red-700 text-xs rounded-xl px-3 py-2">
            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Upload form */}
        <AnimatePresence>
          {showForm && file && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-gray-900 text-sm">New memory</p>
                  <button onClick={resetForm} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400" title="Cancel">
                    <X size={16} />
                  </button>
                </div>

                {/* preview */}
                {previewUrl && (
                  <div className="relative rounded-xl overflow-hidden bg-gray-50 aspect-video flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="max-h-full max-w-full object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
                      {file.name}
                    </div>
                  </div>
                )}

                <input
                  type="text" placeholder="Title (optional)"
                  value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
                <textarea
                  placeholder="Description (optional)" rows={2}
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-300 resize-none"
                />

                {/* day */}
                <label className="block">
                  <span className="text-xs font-semibold text-gray-500 flex items-center gap-1 mb-1">
                    <Calendar size={11} /> Day
                  </span>
                  <input
                    type="date" value={dayKey} onChange={(e) => setDayKey(e.target.value)}
                    min={trip?.startDate} max={trip?.endDate}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-300"
                  />
                </label>

                {/* tag travellers */}
                {travellers.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold text-gray-500 flex items-center gap-1 mb-1.5">
                      <Tag size={11} /> Tag travellers
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {travellers.map((t) => {
                        const on = taggedIds.has(t.id)
                        return (
                          <button
                            key={t.id} type="button" onClick={() => toggleTag(t.id)}
                            className={`flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1 text-xs font-bold transition-all ${on ? 'text-white' : 'text-gray-600 bg-gray-100'}`}
                            style={on ? { backgroundColor: t.color } : undefined}
                          >
                            <span className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center text-[9px] font-black"
                              style={on ? undefined : { backgroundColor: t.color, color: 'white' }}>
                              {t.initials}
                            </span>
                            {t.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* link activity */}
                {allActivities.length > 0 && (
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-500 flex items-center gap-1 mb-1">
                      <Link2 size={11} /> Link to activity
                    </span>
                    <select
                      value={linkedActivityId} onChange={(e) => setLinkedActivityId(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-rose-300"
                    >
                      <option value="">None</option>
                      {allActivities.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                    </select>
                  </label>
                )}

                {/* link saved check-in */}
                {locationPoints.length > 0 && (
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-500 flex items-center gap-1 mb-1">
                      <MapPin size={11} /> Link to check-in
                    </span>
                    <select
                      value={linkedLocationPointId} onChange={(e) => handleLinkLocationPoint(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-rose-300"
                    >
                      <option value="">None</option>
                      {locationPoints.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label || `${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`} · {formatTime(p.capturedAt)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {/* place + GPS */}
                <input
                  type="text" placeholder="Place name (optional)"
                  value={placeName} onChange={(e) => setPlaceName(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button" onClick={handleUseCurrentLocation} disabled={gpsBusy}
                    className="flex items-center gap-1.5 text-xs font-semibold bg-primary-50 hover:bg-primary-100 disabled:opacity-60 text-primary-700 rounded-xl px-3 py-2 transition-colors"
                  >
                    {gpsBusy ? <Loader2 size={12} className="animate-spin" /> : <Navigation size={12} />}
                    {memLocation ? 'Update location' : 'Use current location'}
                  </button>
                  {memLocation && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                      <CheckCircle2 size={12} /> {memLocation.latitude.toFixed(4)}, {memLocation.longitude.toFixed(4)}
                    </span>
                  )}
                </div>
                {gpsError && <p className="text-[11px] text-red-500">{gpsError}</p>}

                {formError && (
                  <div className="flex items-start gap-2 bg-red-50 text-red-700 text-xs rounded-xl px-3 py-2">
                    <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {uploading && (
                  <div className="space-y-1">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-[11px] text-gray-400 text-center">Uploading… {progress}%</p>
                  </div>
                )}

                <button
                  onClick={handleUpload} disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 text-white text-sm font-bold rounded-xl px-4 py-2.5 transition-colors"
                >
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                  {uploading ? 'Saving memory…' : 'Save memory'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gallery */}
        {groups.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Camera size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No memories yet</p>
            <p className="text-xs mt-1">Add your first memory above</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider px-0.5">Gallery</p>
            {groups.map(({ dayKey: gKey, items }) => {
              const expanded = expandedDays.has(gKey)
              return (
                <div key={gKey} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <button
                    onClick={() => setExpandedDays((prev) => {
                      const next = new Set(prev)
                      if (next.has(gKey)) next.delete(gKey); else next.add(gKey)
                      return next
                    })}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-rose-50 rounded-lg flex items-center justify-center">
                        <Clock size={11} className="text-rose-500" />
                      </div>
                      <span className="text-sm font-bold text-gray-800">{formatDate(gKey)}</span>
                      <span className="text-xs text-gray-400 font-medium">{items.length} photo{items.length !== 1 ? 's' : ''}</span>
                    </div>
                    {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  </button>

                  <AnimatePresence initial={false}>
                    {expanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 border-t border-gray-50">
                          {items.map((m) => (
                            <div key={m.id} className="group relative rounded-xl overflow-hidden bg-gray-100 aspect-square cursor-pointer"
                              onClick={() => setLightbox(m)}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={m.photoUrl} alt={m.title || 'Memory'} loading="lazy"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                onError={(e) => {
                                  const el = e.target as HTMLImageElement
                                  el.style.display = 'none'
                                  el.parentElement?.classList.add('items-center', 'justify-center', 'flex')
                                }}
                              />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                {m.title && <p className="text-white text-[11px] font-bold truncate">{m.title}</p>}
                                <div className="flex items-center gap-1 flex-wrap">
                                  {(m.placeName || m.location) && (
                                    <span className="flex items-center gap-0.5 text-white/80 text-[9px]">
                                      <MapPin size={8} /> {m.placeName || 'Tagged'}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {(m.taggedTravellerIds?.length ?? 0) > 0 && (
                                <div className="absolute top-1.5 left-1.5 flex -space-x-1">
                                  {m.taggedTravellerIds!.slice(0, 3).map((id) => {
                                    const t = travellerById(id)
                                    if (!t) return null
                                    return (
                                      <span key={id} className="w-4 h-4 rounded-full border border-white text-[7px] font-black flex items-center justify-center text-white"
                                        style={{ backgroundColor: t.color }} title={t.name}>
                                        {t.initials}
                                      </span>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
      </motion.div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl overflow-hidden max-w-lg w-full max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative bg-gray-900 flex items-center justify-center" style={{ minHeight: 200 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={lightbox.photoUrl} alt={lightbox.title || 'Memory'} className="max-h-[60vh] w-full object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3' }} />
                <button onClick={() => setLightbox(null)}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 space-y-2 overflow-y-auto">
                {lightbox.title && <p className="font-bold text-gray-900">{lightbox.title}</p>}
                {lightbox.description && <p className="text-sm text-gray-600">{lightbox.description}</p>}
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><Calendar size={11} /> {formatDate(lightbox.dayKey ?? lightbox.uploadedAt)}</span>
                  {lightbox.capturedAt && <span className="flex items-center gap-1"><Clock size={11} /> {formatTime(lightbox.capturedAt)}</span>}
                  {lightbox.placeName && <span className="flex items-center gap-1"><MapPin size={11} /> {lightbox.placeName}</span>}
                </div>
                {lightbox.location && (
                  <p className="text-[11px] text-gray-400 font-mono">
                    {lightbox.location.latitude.toFixed(5)}, {lightbox.location.longitude.toFixed(5)}
                  </p>
                )}
                {(lightbox.taggedTravellerIds?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {lightbox.taggedTravellerIds!.map((id) => {
                      const t = travellerById(id)
                      if (!t) return null
                      return (
                        <span key={id} className="flex items-center gap-1 rounded-full pl-1 pr-2.5 py-0.5 text-white text-[11px] font-bold"
                          style={{ backgroundColor: t.color }}>
                          <span className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[8px] font-black">{t.initials}</span>
                          {t.name}
                        </span>
                      )
                    })}
                  </div>
                )}
                <button
                  onClick={() => handleDelete(lightbox)} disabled={deletingId === lightbox.id}
                  className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold rounded-xl px-4 py-2 transition-colors mt-2"
                >
                  {deletingId === lightbox.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Delete memory
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  )
}
