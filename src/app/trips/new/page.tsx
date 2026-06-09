'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Plus, X, Sparkles, ChevronRight } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { createTrip } from '@/lib/firestore'
import AppShell from '@/components/layout/AppShell'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import type { TripType, Traveller } from '@/types'

const TRIP_TYPES: { value: TripType; label: string; emoji: string }[] = [
  { value: 'solo',       label: 'Solo',       emoji: '🧳' },
  { value: 'couple',     label: 'Couple',     emoji: '💑' },
  { value: 'friends',    label: 'Friends',    emoji: '🎉' },
  { value: 'family',     label: 'Family',     emoji: '👨‍👩‍👧' },
  { value: 'group',      label: 'Group',      emoji: '👥' },
  { value: 'office',     label: 'Office',     emoji: '💼' },
  { value: 'pilgrimage', label: 'Pilgrimage', emoji: '🛕' },
  { value: 'wedding',    label: 'Wedding',    emoji: '💍' },
]

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD']

const TRAVELLER_COLORS = [
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#ef4444', '#6366f1', '#f97316', '#06b6d4',
]

const STEPS = ['Basics', 'Travellers', 'Dates & Budget', 'Review']

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].charAt(0).toUpperCase()
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase()
}

function makeTraveller(index: number): Traveller {
  return {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    name: '',
    color: TRAVELLER_COLORS[index % TRAVELLER_COLORS.length],
    initials: '',
  }
}

export default function NewTripPage() {
  const router = useRouter()
  const { user } = useApp()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [destination, setDestination] = useState('')
  const [type, setType] = useState<TripType>('friends')
  const [travellers, setTravellers] = useState<Traveller[]>([makeTraveller(0), makeTraveller(1)])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [budget, setBudget] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isSolo = type === 'solo' || type === 'couple'

  function updateTravellerName(index: number, value: string) {
    setTravellers((prev) =>
      prev.map((t, i) =>
        i === index ? { ...t, name: value, initials: getInitials(value) || `T${i + 1}` } : t
      )
    )
  }

  function addTraveller() {
    if (travellers.length >= 10) return
    setTravellers((prev) => [...prev, makeTraveller(prev.length)])
  }

  function removeTraveller(index: number) {
    setTravellers((prev) => prev.filter((_, i) => i !== index))
  }

  function validate(s: number) {
    const e: Record<string, string> = {}
    if (s === 0) {
      if (!name.trim()) e.name = 'Trip name is required'
      if (!destination.trim()) e.destination = 'Destination is required'
    }
    if (s === 2) {
      if (!startDate) e.startDate = 'Start date is required'
      if (!endDate) e.endDate = 'End date is required'
      if (startDate && endDate && endDate < startDate)
        e.endDate = 'End date must be after start date'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    if (step === 0 && !validate(0)) return
    if (step === 1 && isSolo) { setStep(2); return }
    if (step === 2 && !validate(2)) return
    setStep((s) => s + 1)
  }

  function back() {
    if (step === 2 && isSolo) { setStep(0); return }
    setStep((s) => s - 1)
  }

  async function handleSubmit() {
    if (!validate(2) || !user) return
    setSaving(true)
    try {
      const namedTravellers = isSolo
        ? []
        : travellers.filter((t) => t.name.trim()).map((t) => ({
            ...t,
            name: t.name.trim(),
            initials: getInitials(t.name.trim()) || t.initials,
          }))

      const tripId = await createTrip(user.uid, {
        name: name.trim(),
        destination: destination.trim(),
        type,
        startDate,
        endDate,
        budget: parseFloat(budget) || 0,
        currency,
        notes: notes.trim(),
        travellers: namedTravellers.length > 0 ? namedTravellers : undefined,
      })
      router.push(`/trips/${tripId}/itinerary`)
    } catch (err) {
      console.error(err)
      setSaving(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]

  // Displayed steps — hide Travellers step for solo/couple
  const visibleSteps = isSolo
    ? STEPS.filter((s) => s !== 'Travellers')
    : STEPS

  // Map actual step index to display index
  function displayStepIndex() {
    if (isSolo) {
      if (step === 0) return 0
      if (step === 2) return 1
      if (step === 3) return 2
      return step
    }
    return step
  }

  return (
    <AppShell title="New Trip" back="/dashboard" hideNav>
      {/* Step indicators */}
      <div className="flex items-center gap-1 mb-6">
        {visibleSteps.map((s, i) => {
          const current = displayStepIndex()
          return (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 transition-all ${
                  i < current
                    ? 'bg-primary-500 text-white'
                    : i === current
                    ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-300'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {i < current ? <Check size={14} /> : i + 1}
              </div>
              <span
                className={`text-xs font-medium ${i === current ? 'text-primary-700' : 'text-gray-400'}`}
              >
                {s}
              </span>
              {i < visibleSteps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 rounded-full ml-1 ${i < current ? 'bg-primary-400' : 'bg-gray-200'}`}
                />
              )}
            </div>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* Step 0: Basics */}
        {step === 0 && (
          <motion.div
            key="step0"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-5"
          >
            <button
              onClick={() => router.push('/trips/new/ai-generator')}
              className="w-full text-left rounded-2xl border border-violet-100 bg-violet-50/60 p-3 flex items-center gap-3 hover:bg-violet-50 transition-all"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Sparkles size={15} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-800">Create with AI instead</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Let AI generate a full itinerary from a prompt or guided questions</p>
              </div>
              <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
            </button>

            <div>
              <h2 className="text-xl font-black text-gray-900 mb-1">Trip basics</h2>
              <p className="text-sm text-gray-500">Tell us about your trip.</p>
            </div>

            <Input
              label="Trip name"
              placeholder="e.g. Goa Trip 2025"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors({}) }}
              error={errors.name}
              autoFocus
            />

            <Input
              label="Destination"
              placeholder="e.g. Goa, India"
              value={destination}
              onChange={(e) => { setDestination(e.target.value); setErrors({}) }}
              error={errors.destination}
            />

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Trip type</p>
              <div className="grid grid-cols-2 gap-2">
                {TRIP_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value)}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${
                      type === t.value
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-2xl">{t.emoji}</span>
                    <span
                      className={`font-semibold text-sm ${type === t.value ? 'text-primary-700' : 'text-gray-700'}`}
                    >
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={next} className="w-full" size="lg">
              Continue →
            </Button>
          </motion.div>
        )}

        {/* Step 1: Travellers (non-solo only) */}
        {step === 1 && !isSolo && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-5"
          >
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-1">Who&apos;s coming?</h2>
              <p className="text-sm text-gray-500">
                Add your travel companions to split expenses later.
              </p>
            </div>

            <div className="space-y-2.5">
              {travellers.map((t, i) => (
                <div key={t.id} className="flex items-center gap-2.5">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                    style={{ background: t.color }}
                  >
                    {t.initials || (i + 1)}
                  </div>
                  <input
                    value={t.name}
                    onChange={(e) => updateTravellerName(i, e.target.value)}
                    placeholder={`Person ${i + 1}`}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                  />
                  {travellers.length > 1 && (
                    <button
                      onClick={() => removeTraveller(i)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all flex-shrink-0"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {travellers.length < 10 && (
              <button
                onClick={addTraveller}
                className="flex items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
              >
                <Plus size={15} /> Add person
              </button>
            )}

            <p className="text-xs text-gray-400">
              Names are optional — you can also add them later from the trip settings.
            </p>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={back} className="flex-1">
                ← Back
              </Button>
              <Button onClick={next} className="flex-1">
                Continue →
              </Button>
            </div>
          </motion.div>
        )}

        {/* Step 2: Dates & Budget */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-5"
          >
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-1">Dates &amp; Budget</h2>
              <p className="text-sm text-gray-500">When are you going and what&apos;s your budget?</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Start date"
                type="date"
                min={today}
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setErrors({}) }}
                error={errors.startDate}
              />
              <Input
                label="End date"
                type="date"
                min={startDate || today}
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setErrors({}) }}
                error={errors.endDate}
              />
            </div>

            <div className="flex gap-3">
              <div className="w-28 flex-shrink-0">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <Input
                  label="Total budget (optional)"
                  type="number"
                  placeholder="0"
                  min="0"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Notes (optional)
              </label>
              <textarea
                placeholder="Things to remember, ideas…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent resize-none"
              />
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={back} className="flex-1">
                ← Back
              </Button>
              <Button onClick={next} className="flex-1">
                Review →
              </Button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-5"
          >
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-1">Review &amp; Create</h2>
              <p className="text-sm text-gray-500">Everything look good?</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 shadow-sm">
              {[
                { label: 'Trip name', value: name },
                { label: 'Destination', value: destination },
                { label: 'Type', value: TRIP_TYPES.find((t) => t.value === type)?.label ?? type },
                { label: 'Dates', value: `${startDate} → ${endDate}` },
                { label: 'Budget', value: budget ? `${currency} ${budget}` : 'Not set' },
                ...(!isSolo && travellers.filter((t) => t.name.trim()).length > 0
                  ? [{ label: 'Travellers', value: travellers.filter((t) => t.name.trim()).map((t) => t.name).join(', ') }]
                  : []),
                ...(notes ? [{ label: 'Notes', value: notes }] : []),
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-gray-400">{row.label}</span>
                  <span className="text-sm font-semibold text-gray-900 max-w-[60%] text-right truncate">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 rounded-2xl bg-violet-50/70 border border-violet-100 p-3">
              <span className="text-base leading-none mt-0.5">✨</span>
              <p className="text-xs text-gray-600 leading-relaxed">
                After creating, open <strong>AI Trip Generator</strong> from the trip page to auto-fill a full
                day-by-day itinerary — you preview and edit everything before it&apos;s saved.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={back} className="flex-1">
                ← Back
              </Button>
              <Button onClick={handleSubmit} className="flex-1" disabled={saving}>
                {saving ? 'Creating…' : '🚀 Create Trip'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  )
}
