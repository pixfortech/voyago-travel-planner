import { type CSSProperties } from 'react'

/**
 * Voyago ticket-trust vocabulary. Every pass/ticket and any AI-generated
 * itinerary item declares how reliable its data is, so a seed/estimate is
 * never mistaken for a real booking.
 */
export type TicketStatusKey = 'confirmed' | 'estimated' | 'manual' | 'needs-verification'

export const TICKET_STATUS: Record<TicketStatusKey, { label: string; fg: string; bg: string; solid: string; icon: string }> = {
  confirmed:            { label: 'Confirmed',          fg: 'var(--green-600)',  bg: 'var(--green-100)', solid: 'var(--green-500)',  icon: 'circle-check' },
  estimated:            { label: 'Estimated',          fg: 'var(--sky-600)',    bg: 'var(--sky-50)',    solid: 'var(--sky-400)',    icon: 'wand-magic-sparkles' },
  manual:               { label: 'Manually entered',   fg: 'var(--violet-700)', bg: 'var(--violet-50)', solid: 'var(--violet-500)', icon: 'pen' },
  'needs-verification': { label: 'Needs verification', fg: 'var(--sun-600)',    bg: 'var(--sun-50)',    solid: 'var(--sun-400)',    icon: 'triangle-exclamation' },
}

const SYNONYMS: Record<string, TicketStatusKey> = {
  confirmed: 'confirmed', booked: 'confirmed',
  estimated: 'estimated', estimate: 'estimated', ai: 'estimated', generated: 'estimated',
  manual: 'manual', 'manually entered': 'manual', entered: 'manual',
  'needs-verification': 'needs-verification', 'needs verification': 'needs-verification',
  verify: 'needs-verification', unverified: 'needs-verification',
}

export function normalizeStatus(status?: string | null): TicketStatusKey | null {
  if (!status) return null
  return SYNONYMS[String(status).toLowerCase().trim()] ?? null
}

interface Props {
  status?: string
  onLight?: boolean
  size?: 'sm' | 'md'
  style?: CSSProperties
}

export default function TicketStatus({ status = 'estimated', onLight = false, size = 'md', style }: Props) {
  const key = normalizeStatus(status) ?? 'estimated'
  const s = TICKET_STATUS[key]
  const pad = size === 'sm' ? '3px 9px' : '4px 11px'
  const fs = size === 'sm' ? 11 : 12

  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)',
    fontWeight: 700, fontSize: fs, lineHeight: 1, letterSpacing: '0.01em',
    padding: pad, borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap',
  }

  if (onLight) {
    return (
      <span style={{ ...base, background: 'rgba(255,255,255,0.22)', color: 'var(--white)', border: '1px solid rgba(255,255,255,0.35)', ...style }}>
        <i className={'fas fa-' + s.icon} style={{ fontSize: fs - 1 }} />{s.label}
      </span>
    )
  }
  return (
    <span style={{ ...base, background: s.bg, color: s.fg, ...style }}>
      <i className={'fas fa-' + s.icon} style={{ fontSize: fs - 1, color: s.solid }} />{s.label}
    </span>
  )
}
