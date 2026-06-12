'use client'

import { useEffect, useMemo, useState } from 'react'
import { getCityTheme } from '@/data/cityThemes'

const DEFAULT_LINES = [
  'Reading your brief…',
  'Scouting beaches, food & sights…',
  'Plotting the smartest route…',
  'Pricing stays and transport…',
  'Packing your itinerary…',
]

interface Props {
  /** Override the rotating microcopy (e.g. food-enrichment phase). */
  lines?: string[]
  /** Big title under the orb. */
  title?: string
  /** Static sub-line shown instead of rotating lines when provided. */
  subtitle?: string
  /** When set, render the personalised, city-themed loading experience. */
  city?: string | null
  /** State of the destination — improves theme fallback (region-aware). */
  state?: string | null
}

/**
 * Voyago "planning your trip" state.
 *
 * Two modes:
 *  - Simple: aurora orb + rotating microcopy + progress bar (used for the
 *    food-enrichment sub-phase and as a safe fallback).
 *  - Personalised: when a `city` is supplied (and no explicit `subtitle`),
 *    renders a large city-themed stage — gradient wash, map grid, floating
 *    motifs, a dotted route, rotating cheeky copy and rotating destination
 *    facts. Purely cosmetic; no trip data is fabricated.
 */
export default function GeneratingState({ lines = DEFAULT_LINES, title = 'Planning your trip', subtitle, city, state }: Props) {
  if (city && !subtitle) {
    return <PersonalisedLoader city={city} state={state} />
  }
  return <SimpleLoader lines={lines} title={title} subtitle={subtitle} />
}

function SimpleLoader({ lines, title, subtitle }: { lines: string[]; title: string; subtitle?: string }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (subtitle) return
    const id = setInterval(() => setI((v) => Math.min(v + 1, lines.length - 1)), 1400)
    return () => clearInterval(id)
  }, [lines.length, subtitle])

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16" style={{ fontFamily: 'var(--font-sans)' }}>
      <div style={{ position: 'relative', width: 88, height: 88 }}>
        <div
          style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'var(--grad-aurora)', boxShadow: 'var(--glow-violet)',
            animation: 'vySpin 1.4s var(--ease-in-out) infinite',
          }}
        />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 30 }}>
          <i className="fas fa-wand-magic-sparkles" />
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div className="font-display" style={{ fontWeight: 800, fontSize: 22, color: 'var(--text-strong)' }}>{title}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 14.5, marginTop: 6, minHeight: 20 }}>
          {subtitle ?? lines[i]}
        </div>
      </div>
      {!subtitle && (
        <div style={{ width: 220, height: 6, borderRadius: 999, background: 'var(--ink-200)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%', borderRadius: 999, background: 'var(--grad-aurora)',
              width: ((i + 1) / lines.length) * 100 + '%', transition: 'width 0.5s var(--ease-out)',
            }}
          />
        </div>
      )}
    </div>
  )
}

/** Deterministic-ish spread of motif icons around the stage. */
const MOTIF_SLOTS = [
  { top: '14%', left: '8%',  size: 30, rot: -12, dur: 4.2 },
  { top: '20%', left: '84%', size: 38, rot: 10,  dur: 5.1 },
  { top: '64%', left: '6%',  size: 34, rot: 8,   dur: 4.8 },
  { top: '70%', left: '88%', size: 28, rot: -8,  dur: 4.4 },
  { top: '40%', left: '92%', size: 24, rot: 14,  dur: 5.6 },
]

function PersonalisedLoader({ city, state }: { city: string; state?: string | null }) {
  const theme = useMemo(() => getCityTheme(city, state), [city, state])
  const [lineIdx, setLineIdx] = useState(0)
  const [factIdx, setFactIdx] = useState(0)

  useEffect(() => {
    const a = setInterval(() => setLineIdx((v) => (v + 1) % theme.lines.length), 2200)
    const b = setInterval(() => setFactIdx((v) => (v + 1) % theme.facts.length), 4200)
    return () => { clearInterval(a); clearInterval(b) }
  }, [theme])

  const grad = `var(--grad-${theme.gradient})`

  return (
    <div className="vy-fade-up" style={{ fontFamily: 'var(--font-sans)', padding: '8px 0 24px' }}>
      <div
        style={{
          position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-lg)',
          minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/* gradient wash + map grid */}
        <div style={{ position: 'absolute', inset: 0, background: grad, opacity: 0.14 }} />
        <div className="vy-map-texture" style={{ position: 'absolute', inset: 0, opacity: 0.5 }} />

        {/* dotted route motif */}
        <svg viewBox="0 0 600 360" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.55 }}>
          <path
            d="M40 300 C 160 250, 140 120, 300 150 S 470 90, 560 60"
            fill="none" stroke="var(--teal-500)" strokeWidth="3" strokeLinecap="round"
            strokeDasharray="2 14" style={{ animation: 'vyDash 3s linear infinite' }}
          />
        </svg>

        {/* floating motif icons */}
        {theme.motifs.slice(0, MOTIF_SLOTS.length).map((m, i) => {
          const s = MOTIF_SLOTS[i]
          return (
            <span
              key={m + i}
              className="vy-float"
              style={{
                position: 'absolute', top: s.top, left: s.left, fontSize: s.size,
                color: 'var(--text-strong)', opacity: 0.16,
                ['--vy-rot' as string]: `${s.rot}deg`, ['--vy-dur' as string]: `${s.dur}s`,
              }}
            >
              <i className={'fas fa-' + m} />
            </span>
          )
        })}

        {/* center glass card */}
        <div
          className="vy-glass"
          style={{
            position: 'relative', zIndex: 2, textAlign: 'center', padding: '28px 30px',
            maxWidth: 420, margin: '0 18px', boxShadow: 'var(--shadow-md)',
          }}
        >
          <div style={{ position: 'relative', width: 92, height: 92, margin: '0 auto 18px' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: grad, boxShadow: 'var(--shadow-lg)', animation: 'vySpin 1.5s var(--ease-in-out) infinite' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 32 }}>
              <i className={'fas fa-' + (theme.motifs[0] ?? 'wand-magic-sparkles')} />
            </div>
          </div>

          <div className="font-display" style={{ fontWeight: 800, fontSize: 23, letterSpacing: '-0.02em', color: 'var(--text-strong)' }}>
            Planning your trip{theme.name && theme.name !== 'your trip' ? ` to ${theme.name}` : ''}
          </div>
          <div key={lineIdx} className="vy-fade-up" style={{ color: 'var(--text-body)', fontSize: 14.5, marginTop: 8, minHeight: 40 }}>
            {theme.lines[lineIdx]}
          </div>

          {/* progress shimmer */}
          <div style={{ width: 200, height: 6, borderRadius: 999, background: 'var(--ink-200)', overflow: 'hidden', margin: '14px auto 0' }}>
            <div style={{ height: '100%', borderRadius: 999, background: grad, width: `${((lineIdx + 1) / theme.lines.length) * 100}%`, transition: 'width 0.6s var(--ease-out)' }} />
          </div>
        </div>
      </div>

      {/* rotating destination fact */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
        <span
          key={factIdx}
          className="vy-fade-up"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 9, maxWidth: 560,
            background: 'var(--surface-card)', border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-pill)', padding: '9px 16px', boxShadow: 'var(--shadow-xs)',
            fontSize: 13, color: 'var(--text-muted)',
          }}
        >
          <i className="fas fa-lightbulb" style={{ color: 'var(--sun-500)' }} />
          {theme.facts[factIdx]}
        </span>
      </div>
    </div>
  )
}
