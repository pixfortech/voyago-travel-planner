'use client'

/**
 * VyDashboard — Claude Design dashboard composition (new layout only).
 *
 * Renders the real trips dashboard inside the new-layout shell: a featured-trip
 * hero, real stat tiles, a trips grid, and a right rail (budget meter + quick
 * AI actions + trip facts). Every value comes from the real `trips` passed in —
 * no fabricated tickets, bookings or placeholder trips. The classic dashboard
 * stays untouched behind the layout switch.
 */

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getDayCount, tripTypeLabel, formatShortDate, formatCurrency } from '@/lib/utils'
import { StatTile, BudgetMeter } from '@/components/vy'
import type { Trip } from '@/types'

interface Props {
  trips: Trip[]
  loading: boolean
  onDelete: (id: string) => void
}

const GRADS = ['brand', 'sunset', 'mint', 'candy', 'aurora'] as const

export default function VyDashboard({ trips, loading, onDelete }: Props) {
  const router = useRouter()

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Skeleton height={150} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={76} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={150} />)}
        </div>
      </div>
    )
  }

  if (trips.length === 0) return <EmptyState onAi={() => router.push('/trips/new/ai-generator')} onManual={() => router.push('/trips/new')} />

  const featured = trips[0]!
  const totalDays = trips.reduce((s, t) => s + getDayCount(t.startDate, t.endDate), 0)
  const uniqueDests = new Set(trips.map((t) => t.destination)).size

  return (
    <div className="vy-dash-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20, alignItems: 'start' }}>
      {/* ── Main column ─────────────────────────────────────────────── */}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <FeaturedTrip trip={featured} onOpen={() => router.push(`/trips/${featured.id}`)} onAi={() => router.push(`/trips/${featured.id}/ai-generator`)} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <StatTile icon="suitcase-rolling" value={trips.length} label="Total trips" tone="teal" />
          <StatTile icon="calendar-day" value={totalDays} label="Days planned" tone="violet" />
          <StatTile icon="location-dot" value={uniqueDests} label="Destinations" tone="coral" />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="font-display" style={{ fontWeight: 800, fontSize: 18, color: 'var(--text-strong)' }}>Your trips</span>
            <Link href="/trips/new/ai-generator" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-link)', textDecoration: 'none' }}>Plan a new one →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
            {trips.map((t, i) => (
              <VyTripCard key={t.id} trip={t} gradient={GRADS[i % GRADS.length]} onDelete={onDelete} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Right rail ──────────────────────────────────────────────── */}
      <aside className="vy-dash-rail" style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 22 }}>
        {featured.budget > 0 && (
          <BudgetMeter total={featured.budget} spent={0} currency={featured.currency === 'INR' ? '₹' : featured.currency} gradient="brand" />
        )}

        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)', padding: 18, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-faint)', marginBottom: 12 }}>QUICK ACTIONS</div>
          <RailAction icon="wand-magic-sparkles" tone="violet" title="Plan with AI" desc="Draft a full day-by-day plan" onClick={() => router.push('/trips/new/ai-generator')} />
          <RailAction icon="route" tone="teal" title="Auto-fill this trip" desc="Generate an itinerary for it" onClick={() => router.push(`/trips/${featured.id}/ai-generator`)} />
          <RailAction icon="plus" tone="coral" title="Create manually" desc="Build a trip step by step" onClick={() => router.push('/trips/new')} last />
        </div>

        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)', padding: 18, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-faint)', marginBottom: 12 }}>NEXT TRIP</div>
          <Fact icon="location-dot" tone="var(--coral-500)" label="Destination" value={featured.destination} />
          <Fact icon="calendar-day" tone="var(--teal-500)" label="Dates" value={`${formatShortDate(featured.startDate)} – ${formatShortDate(featured.endDate)}`} />
          <Fact icon="moon" tone="var(--violet-500)" label="Nights" value={String(Math.max(0, getDayCount(featured.startDate, featured.endDate) - 1))} />
          <Fact icon="users" tone="var(--sun-600)" label="Type" value={tripTypeLabel(featured.type)} last />
        </div>
      </aside>

      <style>{`@media (max-width: 1100px) { .vy-dash-grid { grid-template-columns: 1fr !important; } .vy-dash-rail { position: static !important; } }`}</style>
    </div>
  )
}

function FeaturedTrip({ trip, onOpen, onAi }: { trip: Trip; onOpen: () => void; onAi: () => void }) {
  const days = getDayCount(trip.startDate, trip.endDate)
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-md)', background: 'var(--white)' }}>
      <div style={{ position: 'relative', padding: '22px 24px', background: 'var(--grad-brand)', color: '#fff', overflow: 'hidden' }}>
        <div className="vy-map-texture" style={{ position: 'absolute', inset: 0, opacity: 0.18, mixBlendMode: 'overlay' }} />
        <svg viewBox="0 0 400 120" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.35 }}>
          <path d="M20 96 C 110 70, 130 30, 230 44 S 360 24, 388 14" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 9" />
        </svg>
        <div style={{ position: 'relative' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', background: 'rgba(255,255,255,0.22)', padding: '5px 11px', borderRadius: 'var(--radius-pill)' }}>
            <i className="fas fa-star" /> FEATURED TRIP
          </span>
          <h2 className="font-display" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '12px 0 6px' }}>{trip.name}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13.5, flexWrap: 'wrap', opacity: 0.96 }}>
            <span><i className="fas fa-location-dot" style={{ marginRight: 6 }} />{trip.destination}</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}><i className="fas fa-calendar-day" style={{ marginRight: 6, fontFamily: 'var(--font-sans)' }} />{formatShortDate(trip.startDate)} – {formatShortDate(trip.endDate)}</span>
            <span>{days} {days === 1 ? 'day' : 'days'}</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-muted)' }}>
          <i className="fas fa-user-group" style={{ color: 'var(--teal-500)' }} /> {tripTypeLabel(trip.type)}
        </span>
        {trip.budget > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-muted)' }}>
            <i className="fas fa-wallet" style={{ color: 'var(--violet-500)' }} /> <span style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(trip.budget, trip.currency)}</span>
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button type="button" onClick={onAi} style={gradBtn('aurora')}><i className="fas fa-wand-magic-sparkles" /> Generate AI plan</button>
          <button type="button" onClick={onOpen} style={ghostBtn}><i className="fas fa-arrow-right" /> Open</button>
        </span>
      </div>
    </div>
  )
}

function VyTripCard({ trip, gradient, onDelete }: { trip: Trip; gradient: typeof GRADS[number]; onDelete: (id: string) => void }) {
  const days = getDayCount(trip.startDate, trip.endDate)
  return (
    <div className="vy-trip-card" style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-sm)', background: 'var(--white)' }}>
      <Link href={`/trips/${trip.id}`} style={{ display: 'block', textDecoration: 'none' }}>
        <div style={{ position: 'relative', height: 96, background: `var(--grad-${gradient})`, overflow: 'hidden' }}>
          <div className="vy-map-texture" style={{ position: 'absolute', inset: 0, opacity: 0.18, mixBlendMode: 'overlay' }} />
          <span style={{ position: 'absolute', left: 12, bottom: 10, color: '#fff', fontWeight: 700, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i className="fas fa-location-dot" /> {trip.destination}
          </span>
        </div>
        <div style={{ padding: '12px 13px' }}>
          <div className="font-display" style={{ fontWeight: 800, fontSize: 15.5, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trip.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 5, fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{formatShortDate(trip.startDate)}</span>
            <span><i className="fas fa-clock" style={{ marginRight: 4 }} />{days}d</span>
          </div>
        </div>
      </Link>
      <button
        type="button" aria-label="Delete trip"
        onClick={() => onDelete(trip.id)}
        className="vy-trip-del"
        style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.85)', color: 'var(--coral-600)', fontSize: 13, opacity: 0, transition: 'opacity var(--dur-fast, 0.15s)' }}
      >
        <i className="fas fa-trash-can" />
      </button>
      <style>{`.vy-trip-card:hover .vy-trip-del { opacity: 1; }`}</style>
    </div>
  )
}

function RailAction({ icon, tone, title, desc, onClick, last }: { icon: string; tone: 'teal' | 'violet' | 'coral'; title: string; desc: string; onClick: () => void; last?: boolean }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '10px 0',
        border: 'none', borderBottom: last ? 'none' : '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)',
      }}
    >
      <span style={{ width: 36, height: 36, flex: '0 0 36px', borderRadius: 'var(--radius-md)', background: `var(--${tone}-50)`, color: `var(--${tone}-600)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
        <i className={'fas fa-' + icon} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>{desc}</span>
      </span>
      <i className="fas fa-chevron-right" style={{ marginLeft: 'auto', color: 'var(--text-faint)', fontSize: 12 }} />
    </button>
  )
}

function Fact({ icon, tone, label, value, last }: { icon: string; tone: string; label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: last ? 'none' : '1px solid var(--border-subtle)' }}>
      <i className={'fas fa-' + icon} style={{ color: tone, width: 16, textAlign: 'center', fontSize: 13 }} />
      <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', maxWidth: '60%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  )
}

function EmptyState({ onAi, onManual }: { onAi: () => void; onManual: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '56px 24px', borderRadius: 'var(--radius-xl)', border: '1px dashed var(--border-strong)', background: 'var(--surface-card)' }}>
      <div style={{ width: 72, height: 72, borderRadius: 'var(--radius-xl)', background: 'var(--grad-aurora)', boxShadow: 'var(--glow-violet)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 30 }}>
        <i className="fas fa-plane-departure" />
      </div>
      <h2 className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', margin: '18px 0 6px' }}>No trips yet</h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 360, margin: '0 0 20px' }}>Create your first trip and let Voyago draft a full day-by-day plan — flights, stay, route and budget.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button type="button" onClick={onAi} style={gradBtn('aurora')}><i className="fas fa-wand-magic-sparkles" /> Create with AI</button>
        <button type="button" onClick={onManual} style={ghostBtn}><i className="fas fa-plus" /> Create manually</button>
      </div>
    </div>
  )
}

function Skeleton({ height }: { height: number }) {
  return <div style={{ height, borderRadius: 'var(--radius-lg)', background: 'var(--surface-sunk)', animation: 'vyPulseFade 1.4s ease-in-out infinite' }} />
}

function gradBtn(gradient: 'brand' | 'aurora'): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', border: 'none', borderRadius: 'var(--radius-pill)',
    cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 13.5, color: '#fff',
    background: `var(--grad-${gradient})`, boxShadow: gradient === 'aurora' ? 'var(--glow-violet)' : 'var(--glow-teal)',
  }
}

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 'var(--radius-pill)',
  cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 13.5, color: 'var(--text-body)',
  background: 'var(--white)', border: '1px solid var(--border-soft)',
}
