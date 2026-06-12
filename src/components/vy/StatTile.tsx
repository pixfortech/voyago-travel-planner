import { type CSSProperties } from 'react'

const TONES: Record<string, { fg: string; bg: string }> = {
  teal:   { fg: 'var(--teal-600)',   bg: 'var(--teal-50)' },
  coral:  { fg: 'var(--coral-600)',  bg: 'var(--coral-50)' },
  violet: { fg: 'var(--violet-600)', bg: 'var(--violet-50)' },
  sun:    { fg: 'var(--sun-600)',    bg: 'var(--sun-50)' },
  sky:    { fg: 'var(--sky-600)',    bg: 'var(--sky-50)' },
  green:  { fg: 'var(--green-600)',  bg: 'var(--green-100)' },
}

interface Props {
  icon?: string
  value: string | number
  label: string
  tone?: keyof typeof TONES
  style?: CSSProperties
}

/** Compact dashboard stat tile with a tinted icon chip. */
export default function StatTile({ icon = 'location-dot', value, label, tone = 'teal', style }: Props) {
  const t = TONES[tone] ?? TONES.teal
  return (
    <div
      style={{
        background: 'var(--surface-card)', border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-lg)', padding: 16, boxShadow: 'var(--shadow-sm)',
        display: 'flex', alignItems: 'center', gap: 13, fontFamily: 'var(--font-sans)', ...style,
      }}
    >
      <span style={{ width: 44, height: 44, flex: '0 0 44px', borderRadius: 'var(--radius-md)', background: t.bg, color: t.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
        <i className={'fas fa-' + icon} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 23, fontWeight: 800, color: 'var(--text-strong)', lineHeight: 1.05, whiteSpace: 'nowrap' }}>{value}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'nowrap' }}>{label}</div>
      </div>
    </div>
  )
}
