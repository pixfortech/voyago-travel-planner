'use client'

/**
 * TripGeneratorWizard — Phase 15C.
 *
 * Guided, multi-step form that collects trip basics, traveller composition,
 * preferences, budget, and must-visit/avoid lists, then builds a privacy-safe
 * TripGeneratorInput and hands it to the parent via onGenerate. It never calls
 * the AI itself and never touches Firestore.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  MapPin, Users, Heart, Wallet, ListChecks, Sparkles, Loader2,
  ChevronRight, ChevronLeft, Check,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { formatCurrency } from '@/lib/utils'
import type {
  Trip, TripGeneratorInput, TravellerComposition, TripGenerationPreferences,
  GeneratorMode, TravelPace, TripInterest, FoodPreference,
  AccommodationStyle, RoutePreferenceStyle, GeneratorExistingDay,
} from '@/types'

interface TripGeneratorWizardProps {
  trip: Trip
  dayCount: number
  existingDays: GeneratorExistingDay[]
  generating: boolean
  onGenerate: (input: TripGeneratorInput) => void
}

const STEPS = ['Basics', 'Travellers', 'Preferences', 'Budget', 'Must / Avoid'] as const

const PACES: { key: TravelPace; label: string }[] = [
  { key: 'relaxed', label: 'Relaxed' },
  { key: 'balanced', label: 'Balanced' },
  { key: 'packed', label: 'Packed' },
]

const INTERESTS: { key: TripInterest; label: string }[] = [
  { key: 'sightseeing', label: 'Sightseeing' },
  { key: 'food', label: 'Food' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'adventure', label: 'Adventure' },
  { key: 'spiritual', label: 'Spiritual' },
  { key: 'museums', label: 'Museums' },
  { key: 'nature', label: 'Nature' },
  { key: 'nightlife', label: 'Nightlife' },
  { key: 'photography', label: 'Photography' },
  { key: 'kid_friendly', label: 'Kid-friendly' },
  { key: 'senior_friendly', label: 'Senior-friendly' },
  { key: 'luxury', label: 'Luxury' },
  { key: 'budget', label: 'Budget' },
  { key: 'local_culture', label: 'Local culture' },
]

const FOODS: { key: FoodPreference; label: string }[] = [
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'non_vegetarian', label: 'Non-veg' },
  { key: 'jain', label: 'Jain' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'local_food', label: 'Local food' },
  { key: 'cafe_hopping', label: 'Café-hopping' },
  { key: 'fine_dining', label: 'Fine dining' },
  { key: 'street_food', label: 'Street food' },
]

const ACCOMMODATION: { key: AccommodationStyle; label: string }[] = [
  { key: 'budget', label: 'Budget' },
  { key: 'mid_range', label: 'Mid-range' },
  { key: 'premium', label: 'Premium' },
  { key: 'luxury', label: 'Luxury' },
]

const ROUTE_PREFS: { key: RoutePreferenceStyle; label: string }[] = [
  { key: 'shortest', label: 'Shortest' },
  { key: 'fastest', label: 'Fastest' },
  { key: 'scenic', label: 'Scenic' },
  { key: 'less_walking', label: 'Less walking' },
  { key: 'senior_friendly', label: 'Senior-friendly' },
  { key: 'child_friendly', label: 'Child-friendly' },
]

const CONSTRAINTS = [
  'Avoid early mornings',
  'Avoid late nights',
  'Low walking / wheelchair friendly',
  'Frequent rest breaks',
  'Family-friendly only',
  'Pet-friendly',
]

const MODES: { key: GeneratorMode; label: string; hint: string }[] = [
  { key: 'append', label: 'Append', hint: 'Add new activities, keep everything existing' },
  { key: 'fill_empty', label: 'Fill empty days', hint: 'Only plan days with no activities yet' },
  { key: 'replace_future', label: 'Replace future days', hint: 'Replace days after today (past protected)' },
  { key: 'replace_all_unprotected', label: 'Replace unprotected', hint: 'Replace today + future (completed protected)' },
]

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
        active
          ? 'bg-violet-500 text-white border-violet-500 shadow-sm'
          : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  )
}

export default function TripGeneratorWizard({
  trip, dayCount, existingDays, generating, onGenerate,
}: TripGeneratorWizardProps) {
  const [step, setStep] = useState(0)

  // Basics
  const [destination, setDestination] = useState(trip.destination)
  const [mode, setMode] = useState<GeneratorMode>(
    existingDays.some((d) => !d.isEmpty && !d.isPast) ? 'append' : 'fill_empty',
  )

  // Travellers
  const tripTravellers = trip.travellers?.length ?? 0
  const [total, setTotal] = useState(Math.max(tripTravellers, 1))
  const [couples, setCouples] = useState(0)
  const [adults, setAdults] = useState(0)
  const [kids, setKids] = useState(0)
  const [seniors, setSeniors] = useState(0)
  const [friends, setFriends] = useState(0)
  const [family, setFamily] = useState(trip.type === 'family')
  const [office, setOffice] = useState(trip.type === 'office')
  const [pilgrimage, setPilgrimage] = useState(trip.type === 'pilgrimage')
  const [compNotes, setCompNotes] = useState('')

  // Preferences
  const [pace, setPace] = useState<TravelPace>('balanced')
  const [interests, setInterests] = useState<TripInterest[]>(['sightseeing', 'food'])
  const [foods, setFoods] = useState<FoodPreference[]>([])
  const [foodAvoid, setFoodAvoid] = useState('')
  const [accommodation, setAccommodation] = useState<AccommodationStyle | undefined>(undefined)
  const [routePref, setRoutePref] = useState<RoutePreferenceStyle | undefined>(undefined)
  const [constraints, setConstraints] = useState<string[]>([])

  // Budget
  const [budget, setBudget] = useState(trip.budget || 0)

  // Must / avoid
  const [mustVisit, setMustVisit] = useState('')
  const [avoidPlaces, setAvoidPlaces] = useState('')
  const [extraNotes, setExtraNotes] = useState('')

  function toggle<T>(list: T[], value: T, setter: (v: T[]) => void) {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value])
  }

  function buildInput(): TripGeneratorInput {
    const composition: TravellerComposition = {
      total: Math.max(total, 1),
      couples: couples || undefined,
      adults: adults || undefined,
      kids: kids || undefined,
      seniors: seniors || undefined,
      friends: friends || undefined,
      family: family || undefined,
      office: office || undefined,
      pilgrimage: pilgrimage || undefined,
      notes: compNotes.trim() || undefined,
    }
    const preferences: TripGenerationPreferences = {
      pace,
      interests,
      foodPreferences: foods,
      foodAvoid: foodAvoid.trim() || undefined,
      accommodationStyle: accommodation,
      routePreference: routePref,
      constraints,
      mustVisit: mustVisit.split(',').map((s) => s.trim()).filter(Boolean),
      avoidPlaces: avoidPlaces.split(',').map((s) => s.trim()).filter(Boolean),
      extraNotes: extraNotes.trim() || undefined,
    }
    return {
      destination: destination.trim(),
      startDate: trip.startDate,
      endDate: trip.endDate,
      dayCount,
      budget: Math.max(budget, 0),
      currency: trip.currency,
      travellerCount: Math.max(total, 1),
      composition,
      tripType: trip.type,
      preferences,
      mode,
      today: new Date().toISOString().slice(0, 10),
      existingDays,
    }
  }

  const canGenerate = destination.trim().length >= 2 && total >= 1
  const isLast = step === STEPS.length - 1

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Step header */}
      <div className="flex items-center gap-1 px-4 pt-4 overflow-x-auto">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              i === step ? 'bg-violet-100 text-violet-700' : i < step ? 'text-emerald-600' : 'text-gray-400'
            }`}
          >
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${
              i === step ? 'bg-violet-500 text-white' : i < step ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {i < step ? <Check size={10} /> : i + 1}
            </span>
            {label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-5">
        <motion.div key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
          {/* Step 0 — Basics */}
          {step === 0 && (
            <div className="space-y-4">
              <SectionTitle icon={<MapPin size={15} />} title="Trip basics" />
              <Input label="Destination" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Jaipur, Rajasthan" />
              <div className="grid grid-cols-3 gap-3 text-xs">
                <Field label="Start"><span className="text-gray-700 font-semibold">{trip.startDate}</span></Field>
                <Field label="End"><span className="text-gray-700 font-semibold">{trip.endDate}</span></Field>
                <Field label="Days"><span className="text-gray-700 font-semibold">{dayCount}</span></Field>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1.5">How should it merge with the existing itinerary?</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {MODES.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setMode(m.key)}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        mode === m.key ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="text-sm font-bold text-gray-800">{m.label}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{m.hint}</p>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-2">Completed and past days are always protected.</p>
              </div>
            </div>
          )}

          {/* Step 1 — Travellers */}
          {step === 1 && (
            <div className="space-y-4">
              <SectionTitle icon={<Users size={15} />} title="Travellers" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Counter label="Total" value={total} onChange={setTotal} min={1} />
                <Counter label="Couples" value={couples} onChange={setCouples} />
                <Counter label="Adults" value={adults} onChange={setAdults} />
                <Counter label="Kids" value={kids} onChange={setKids} />
                <Counter label="Seniors" value={seniors} onChange={setSeniors} />
                <Counter label="Friends" value={friends} onChange={setFriends} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Chip active={family} onClick={() => setFamily(!family)}>Family group</Chip>
                <Chip active={office} onClick={() => setOffice(!office)}>Office group</Chip>
                <Chip active={pilgrimage} onClick={() => setPilgrimage(!pilgrimage)}>Pilgrimage group</Chip>
              </div>
              <Input
                label="Notes (optional)"
                value={compNotes}
                onChange={(e) => setCompNotes(e.target.value)}
                placeholder="e.g. two seniors, avoid stairs, prefer vegetarian"
              />
              {tripTravellers > 0 && (
                <p className="text-[11px] text-gray-400">This trip has {tripTravellers} saved traveller(s); adjust the counts as needed.</p>
              )}
            </div>
          )}

          {/* Step 2 — Preferences */}
          {step === 2 && (
            <div className="space-y-4">
              <SectionTitle icon={<Heart size={15} />} title="Preferences" />
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1.5">Pace</p>
                <div className="flex gap-2">
                  {PACES.map((p) => <Chip key={p.key} active={pace === p.key} onClick={() => setPace(p.key)}>{p.label}</Chip>)}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1.5">Interests</p>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map((it) => <Chip key={it.key} active={interests.includes(it.key)} onClick={() => toggle(interests, it.key, setInterests)}>{it.label}</Chip>)}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1.5">Food preferences</p>
                <div className="flex flex-wrap gap-2">
                  {FOODS.map((f) => <Chip key={f.key} active={foods.includes(f.key)} onClick={() => toggle(foods, f.key, setFoods)}>{f.label}</Chip>)}
                </div>
              </div>
              <Input
                label="Allergies / food to avoid (optional)"
                value={foodAvoid}
                onChange={(e) => setFoodAvoid(e.target.value)}
                placeholder="e.g. peanuts, shellfish"
              />
              <p className="text-[11px] text-amber-600">Allergy notes are treated as preferences only — always verify safety at the venue.</p>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1.5">Accommodation style</p>
                <div className="flex flex-wrap gap-2">
                  {ACCOMMODATION.map((acc) => <Chip key={acc.key} active={accommodation === acc.key} onClick={() => setAccommodation(accommodation === acc.key ? undefined : acc.key)}>{acc.label}</Chip>)}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1.5">Route preference</p>
                <div className="flex flex-wrap gap-2">
                  {ROUTE_PREFS.map((r) => <Chip key={r.key} active={routePref === r.key} onClick={() => setRoutePref(routePref === r.key ? undefined : r.key)}>{r.label}</Chip>)}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1.5">Constraints</p>
                <div className="flex flex-wrap gap-2">
                  {CONSTRAINTS.map((c) => <Chip key={c} active={constraints.includes(c)} onClick={() => toggle(constraints, c, setConstraints)}>{c}</Chip>)}
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Budget */}
          {step === 3 && (
            <div className="space-y-4">
              <SectionTitle icon={<Wallet size={15} />} title="Budget" />
              <Input
                label={`Total budget (${trip.currency})`}
                type="number"
                min="0"
                value={budget || ''}
                onChange={(e) => setBudget(Number(e.target.value) || 0)}
                placeholder="e.g. 80000"
              />
              {budget > 0 && total > 0 && (
                <p className="text-xs text-gray-500">
                  ≈ {formatCurrency(Math.round(budget / total), trip.currency)} per traveller across {dayCount} day(s).
                </p>
              )}
              <p className="text-[11px] text-gray-400">Leave at 0 for no budget target. Generated costs are estimates, not actual expenses.</p>
            </div>
          )}

          {/* Step 4 — Must / Avoid */}
          {step === 4 && (
            <div className="space-y-4">
              <SectionTitle icon={<ListChecks size={15} />} title="Must-visit & avoid" />
              <Input label="Must-visit places (comma separated)" value={mustVisit} onChange={(e) => setMustVisit(e.target.value)} placeholder="Amber Fort, Hawa Mahal" />
              <Input label="Avoid places (comma separated)" value={avoidPlaces} onChange={(e) => setAvoidPlaces(e.target.value)} placeholder="crowded markets" />
              <Input label="Anything else? (optional)" value={extraNotes} onChange={(e) => setExtraNotes(e.target.value)} placeholder="e.g. celebrate anniversary on day 2" />
            </div>
          )}
        </motion.div>

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-2 mt-5 pt-4 border-t border-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || generating}>
            <ChevronLeft size={15} /> Back
          </Button>
          {!isLast ? (
            <Button size="sm" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              Next <ChevronRight size={15} />
            </Button>
          ) : (
            <Button size="sm" onClick={() => onGenerate(buildInput())} disabled={!canGenerate || generating}>
              {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {generating ? 'Generating…' : 'Generate itinerary'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Small presentational helpers ──────────────────────────────────────────────

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-gray-900">
      <span className="text-violet-500">{icon}</span>
      <h3 className="text-sm font-bold">{title}</h3>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2">
      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}

function Counter({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2">
      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">{label}</p>
      <div className="flex items-center justify-between gap-1">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="w-6 h-6 rounded-lg bg-white border border-gray-200 text-gray-500 font-bold leading-none">−</button>
        <span className="text-sm font-black text-gray-800 tabular-nums">{value}</span>
        <button type="button" onClick={() => onChange(value + 1)} className="w-6 h-6 rounded-lg bg-white border border-gray-200 text-gray-500 font-bold leading-none">+</button>
      </div>
    </div>
  )
}
