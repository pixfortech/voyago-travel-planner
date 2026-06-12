'use client'

import { type CSSProperties, useState } from 'react'
import TicketStatus from './TicketStatus'

interface Stop { point: string; time?: string }
interface Props {
  operator?: string
  busType?: string
  boarding?: Stop
  dropping?: Stop
  duration?: string
  seats?: string | string[]
  bookingRef?: string
  travellers?: number
  status?: string
  source?: string
  onClick?: () => void
  style?: CSSProperties
}

/** Bus ticket — dotted-road route line, operator + bus type, source label. */
export default function BusTicketCard({
  operator = 'Bus', busType, boarding = { point: '—' }, dropping = { point: '—' },
  duration, seats, bookingRef, travellers, status = 'estimated', source = 'manual entry', onClick, style,
}: Props) {
  const [hover, setHover] = useState(false)
  const seatList = Array.isArray(seats) ? seats.join(', ') : seats
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', borderRadius: 'var(--radius-xl)', overflow: 'hidden', background: 'var(--white)',
        border: '1px solid var(--border-soft)',
        boxShadow: hover ? 'var(--shadow-hover)' : 'var(--shadow-lg)',
        transform: hover ? 'translateY(-3px)' : 'none',
        transition: 'transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base)',
        cursor: onClick ? 'pointer' : 'default', fontFamily: 'var(--font-sans)', ...style,
      }}
    >
      <div style={{ background: 'var(--grad-sunset)', color: 'var(--white)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <i className="fas fa-bus-simple" style={{ fontSize: 15 }} />
          <span style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{operator}</span>
        </span>
        <TicketStatus status={status} onLight size="sm" />
      </div>

      {busType && (
        <div style={{ padding: '10px 20px 0' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--orange-600)', background: '#FFF1E6', padding: '4px 11px', borderRadius: 'var(--radius-pill)' }}>
            <i className="fas fa-chair" style={{ fontSize: 11 }} />{busType}
          </span>
        </div>
      )}

      <div style={{ padding: '14px 20px 12px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <StopBox point={boarding.point} time={boarding.time} kind="Boarding" align="left" />
        <div style={{ flex: 1, paddingTop: 4 }}>
          <div style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--orange-500)', flex: '0 0 9px' }} />
            <div style={{ flex: 1, height: 3, borderRadius: 999, backgroundImage: 'repeating-linear-gradient(90deg, var(--orange-400) 0 8px, transparent 8px 15px)' }} />
            <i className="fas fa-bus" style={{ color: 'var(--coral-500)', fontSize: 16, margin: '0 4px' }} />
            <div style={{ flex: 1, height: 3, borderRadius: 999, backgroundImage: 'repeating-linear-gradient(90deg, var(--orange-400) 0 8px, transparent 8px 15px)' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50% 50% 50% 0', background: 'var(--coral-500)', transform: 'rotate(-45deg)', flex: '0 0 11px' }} />
          </div>
          {duration && <div style={{ textAlign: 'center', marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-faint)' }}>{duration}</div>}
        </div>
        <StopBox point={dropping.point} time={dropping.time} kind="Dropping" align="right" />
      </div>

      <div style={{ padding: '4px 20px 0', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {seatList && <Field k="SEATS" v={seatList} mono />}
        {travellers != null && <Field k="TRAVELLERS" v={String(travellers)} />}
        {bookingRef && <Field k="BOOKING REF" v={bookingRef} mono />}
      </div>

      <div style={{ marginTop: 14, padding: '10px 20px', borderTop: '1px dashed var(--border-subtle)', background: 'var(--ink-50)' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          <i className="fas fa-circle-info" style={{ marginRight: 6, color: 'var(--text-faint)' }} />
          Source: <span style={{ fontWeight: 600, color: 'var(--text-body)' }}>{source}</span>
        </span>
      </div>
    </div>
  )
}

function StopBox({ point, time, kind, align }: { point: string; time?: string; kind: string; align: 'left' | 'right' }) {
  return (
    <div style={{ textAlign: align, minWidth: 90, maxWidth: 140 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-faint)' }}>{kind.toUpperCase()}</div>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text-strong)', marginTop: 3, lineHeight: 1.15 }}>{point}</div>
      {time && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-body)', marginTop: 4, fontWeight: 700 }}>{time}</div>}
    </div>
  )
}

function Field({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-faint)' }}>{k}</div>
      <div style={{ fontSize: 14.5, fontWeight: mono ? 700 : 600, color: 'var(--text-strong)', marginTop: 2, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)' }}>{v}</div>
    </div>
  )
}
