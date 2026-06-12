'use client'

/**
 * VyBriefForm — Claude Design "Tell me about your trip." create-trip form.
 *
 * Pure presentation: it owns no trip state. Every field reads from the page's
 * `brief` and writes through the page's existing setters/handlers, so the
 * generation logic, validation and data shape are exactly the classic flow's.
 * Rendered only when the new layout is active; the classic form is untouched.
 */

import type { TripBrief } from './briefTypes'
import type { TripType, TravelPace, TripInterest, TripGenerationPreferences } from '@/types'
import type { IndiaCity } from '@/data/indiaCities'
import VyCitySelect from './VyCitySelect'

interface Props {
  brief: TripBrief
  briefErrors: Record<string, string>
  onSelectCity: (c: IndiaCity) => void
  onCustomDestination: (t: string) => void
  onClearDestination: () => void
  onSetOrigin: (c: IndiaCity) => void
  onClearOrigin: () => void
  onPatch: (patch: Partial<TripBrief>) => void
  onSetPrefs: (patch: Partial<TripGenerationPreferences>) => void
  onSetCount: (n: number) => void
  onGenerate: () => void
  onAdvanced: () => void
  onPromptMode: () => void
  onGuidedMode: () => void
}

const TRIP_TYPES: { value: TripType; label: string; icon: string }[] = [
  { value: 'solo', label: 'Solo', icon: 'user' },
  { value: 'couple', label: 'Couple', icon: 'heart' },
  { value: 'friends', label: 'Friends', icon: 'users' },
  { value: 'family', label: 'Family', icon: 'people-roof' },
  { value: 'group', label: 'Group', icon: 'people-group' },
  { value: 'office', label: 'Office', icon: 'briefcase' },
  { value: 'pilgrimage', label: 'Pilgrimage', icon: 'place-of-worship' },
  { value: 'wedding', label: 'Wedding', icon: 'ring' },
]

const VIBES: { value: TripInterest; label: string; icon: string }[] = [
  { value: 'sightseeing', label: 'Sightseeing', icon: 'camera-retro' },
  { value: 'food', label: 'Food', icon: 'utensils' },
  { value: 'nightlife', label: 'Nightlife', icon: 'champagne-glasses' },
  { value: 'nature', label: 'Nature', icon: 'mountain-sun' },
  { value: 'adventure', label: 'Adventure', icon: 'person-hiking' },
  { value: 'shopping', label: 'Shopping', icon: 'bag-shopping' },
  { value: 'spiritual', label: 'Spiritual', icon: 'hands-praying' },
  { value: 'museums', label: 'Museums', icon: 'landmark' },
  { value: 'photography', label: 'Photography', icon: 'image' },
  { value: 'kid_friendly', label: 'Kid-friendly', icon: 'child-reaching' },
]

const PACES: { value: TravelPace; label: string }[] = [
  { value: 'relaxed', label: 'Chill' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'packed', label: 'Packed' },
]

function Field({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
        <i className={'fas fa-' + icon} style={{ color: 'var(--teal-500)', fontSize: 13 }} />
        {label}
      </div>
      {children}
    </div>
  )
}

function inputStyle(error?: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '11px 12px', fontSize: 14, fontFamily: 'var(--font-sans)',
    color: 'var(--text-strong)', background: 'var(--surface-sunk)',
    border: `1px solid ${error ? 'var(--coral-400)' : 'var(--border-soft)'}`,
    borderRadius: 'var(--radius-md)', outline: 'none',
  }
}

function Chip({ selected, tone = 'teal', icon, children, onClick }: {
  selected?: boolean; tone?: 'teal' | 'violet' | 'coral'; icon?: string; children: React.ReactNode; onClick: () => void
}) {
  const fg = `var(--${tone}-600)`
  const bg = `var(--${tone}-50)`
  const bd = `var(--${tone}-300)`
  return (
    <button
      type="button" onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', cursor: 'pointer',
        borderRadius: 'var(--radius-pill)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
        border: `1.5px solid ${selected ? bd : 'var(--border-soft)'}`,
        background: selected ? bg : 'var(--white)',
        color: selected ? fg : 'var(--text-body)',
        boxShadow: selected ? 'none' : 'var(--shadow-xs)', transition: 'all var(--dur-fast, 0.15s) var(--ease-out)',
      }}
    >
      {icon && <i className={'fas fa-' + icon} style={{ fontSize: 12.5, color: selected ? fg : 'var(--text-faint)' }} />}
      {children}
    </button>
  )
}

export default function VyBriefForm({
  brief, briefErrors, onSelectCity, onCustomDestination, onClearDestination,
  onSetOrigin, onClearOrigin, onPatch, onSetPrefs, onSetCount,
  onGenerate, onAdvanced, onPromptMode, onGuidedMode,
}: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const interests = brief.preferences.interests
  const toggleVibe = (v: TripInterest) =>
    onSetPrefs({ interests: interests.includes(v) ? interests.filter((x) => x !== v) : [...interests, v] })

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', fontFamily: 'var(--font-sans)', padding: '4px 0 24px' }}>
      {/* hero */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--violet-600)', background: 'var(--violet-50)', padding: '6px 14px', borderRadius: 'var(--radius-pill)' }}>
          <i className="fas fa-wand-magic-sparkles" /> AI TRIP PLANNER
        </span>
        <h1 className="font-display" style={{ fontSize: 33, marginTop: 14, marginBottom: 0, letterSpacing: '-0.03em', color: 'var(--text-strong)', fontWeight: 800 }}>
          Tell me about your trip.
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, marginTop: 8 }}>
          A few details and Voyago drafts a full day-by-day plan — flights, stay, route and budget.
        </p>
      </div>

      {/* form card */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-md)', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <Field label="Where to?" icon="location-dot">
            <VyCitySelect
              icon="map-location-dot"
              placeholder="e.g. Goa, India"
              value={brief.destination || undefined}
              onSelect={onSelectCity}
              onClear={onClearDestination}
              allowCustom
              onCustom={onCustomDestination}
              error={briefErrors.destination}
            />
          </Field>
          <Field label="From" icon="plane-departure">
            <VyCitySelect
              icon="city"
              placeholder="e.g. Delhi"
              value={brief.origin || undefined}
              onSelect={onSetOrigin}
              onClear={onClearOrigin}
              allowCustom
              onCustom={(t) => onPatch({ origin: t })}
            />
          </Field>
          <Field label="Dates" icon="calendar-day">
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" min={today} value={brief.startDate}
                onChange={(e) => onPatch({ startDate: e.target.value })}
                style={inputStyle(!!briefErrors.startDate)} aria-label="Start date" />
              <input type="date" min={brief.startDate || today} value={brief.endDate}
                onChange={(e) => onPatch({ endDate: e.target.value })}
                style={inputStyle(!!briefErrors.endDate)} aria-label="End date" />
            </div>
            {(briefErrors.startDate || briefErrors.endDate) && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--coral-600)' }}>{briefErrors.startDate || briefErrors.endDate}</p>
            )}
          </Field>
          <Field label="Budget" icon="wallet">
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-muted)', pointerEvents: 'none' }}>
                {brief.currency === 'INR' ? '₹' : brief.currency}
              </span>
              <input type="number" min={0} placeholder="85,000"
                value={brief.budget > 0 ? String(brief.budget) : ''}
                onChange={(e) => onPatch({ budget: parseFloat(e.target.value) || 0 })}
                style={{ ...inputStyle(), paddingLeft: brief.currency === 'INR' ? 30 : 52, fontFamily: 'var(--font-mono)' }} aria-label="Budget" />
            </div>
          </Field>
        </div>

        <Field label="Who's going?" icon="users">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {TRIP_TYPES.map((t) => (
              <Chip key={t.value} tone="teal" selected={brief.tripType === t.value} icon={t.icon}
                onClick={() => onPatch({ tripType: t.value })}>{t.label}</Chip>
            ))}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>People</span>
              <input type="number" min={1} max={30} value={brief.travellerCount}
                onChange={(e) => onSetCount(parseInt(e.target.value) || 1)}
                style={{ width: 64, padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 14, textAlign: 'center', background: 'var(--surface-sunk)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-md)', outline: 'none', color: 'var(--text-strong)' }}
                aria-label="Number of people" />
            </span>
          </div>
        </Field>

        <Field label="Trip vibe" icon="sparkles">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {VIBES.map((v) => (
              <Chip key={v.value} tone="violet" selected={interests.includes(v.value)} icon={v.icon}
                onClick={() => toggleVibe(v.value)}>{v.label}</Chip>
            ))}
          </div>
        </Field>

        <Field label="Pace" icon="gauge-high">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PACES.map((p) => (
              <Chip key={p.value} tone="coral" selected={brief.preferences.pace === p.value}
                onClick={() => onSetPrefs({ pace: p.value })}>{p.label}</Chip>
            ))}
          </div>
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px dashed var(--border-subtle)' }}>
          <button type="button" onClick={onAdvanced}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--text-link)', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <i className="fas fa-sliders" /> Advanced — transport, stay & budget split
          </button>
          <div style={{ display: 'flex', gap: 14 }}>
            <button type="button" onClick={onPromptMode} style={altLinkStyle}><i className="fas fa-pen" style={{ marginRight: 6 }} />Write a prompt</button>
            <button type="button" onClick={onGuidedMode} style={altLinkStyle}><i className="fas fa-comments" style={{ marginRight: 6 }} />Guided Q&amp;A</button>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center' }}>
        <button
          type="button" onClick={onGenerate} disabled={!brief.destination.trim()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 34px', cursor: brief.destination.trim() ? 'pointer' : 'not-allowed',
            border: 'none', borderRadius: 'var(--radius-pill)', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 16, color: '#fff',
            background: 'var(--grad-aurora)', boxShadow: 'var(--glow-violet)', opacity: brief.destination.trim() ? 1 : 0.55,
          }}
        >
          <i className="fas fa-wand-magic-sparkles" /> Generate AI plan
        </button>
      </div>
      <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 12.5, marginTop: 12 }}>
        <i className="fas fa-circle-info" style={{ marginRight: 5 }} />
        Voyago drafts estimates — you confirm real bookings before they&apos;re marked confirmed.
      </p>
    </div>
  )
}

const altLinkStyle: React.CSSProperties = {
  border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)',
  fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)',
}
