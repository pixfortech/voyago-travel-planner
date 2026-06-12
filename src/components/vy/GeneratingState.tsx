'use client'

import { useEffect, useState } from 'react'

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
}

/**
 * Voyago "planning your trip" state — aurora orb, rotating microcopy and a
 * progress bar. Purely presentational; the caller controls when it's shown.
 */
export default function GeneratingState({ lines = DEFAULT_LINES, title = 'Planning your trip', subtitle }: Props) {
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
            background: 'linear-gradient(135deg, #7B61FF 0%, #38BDF8 55%, #20C0B0 100%)',
            boxShadow: '0 10px 26px rgba(123,97,255,0.40)',
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
              height: '100%', borderRadius: 999,
              background: 'linear-gradient(135deg, #7B61FF 0%, #38BDF8 55%, #20C0B0 100%)',
              width: ((i + 1) / lines.length) * 100 + '%', transition: 'width 0.5s var(--ease-out)',
            }}
          />
        </div>
      )}
    </div>
  )
}
