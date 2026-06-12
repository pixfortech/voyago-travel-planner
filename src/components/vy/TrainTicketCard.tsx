'use client'

import { type CSSProperties, useState } from 'react'
import TicketStatus from './TicketStatus'

interface Station { code: string; name: string }
interface Props {
  trainNumber?: string
  trainName?: string
  pnr?: string
  bookingRef?: string
  from?: Station
  to?: Station
  departure?: string
  arrival?: string
  duration?: string
  coachClass?: string
  coach?: string
  seat?: string
  platform?: string
  travellers?: number
  status?: string
  source?: string
  onClick?: () => void
  style?: CSSProperties
}

/** Train ticket — rail-track route line, mono codes/PNR, source label. */
export default function TrainTicketCard({
  trainNumber = '—', trainName = 'Train', pnr, bookingRef,
  from = { code: '—', name: '' }, to = { code: '—', name: '' },
  departure, arrival, duration, coachClass, coach, seat, platform,
  travellers, status = 'estimated', source = 'imported timetable', onClick, style,
}: Props) {
  const [hover, setHover] = useState(false)
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
      <div style={{ background: 'var(--grad-mint)', color: 'var(--white)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <i className="fas fa-train" style={{ fontSize: 15 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 700 }}>{trainNumber}</span>
          <span style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trainName}</span>
        </span>
        <TicketStatus status={status} onLight size="sm" />
      </div>

      <div style={{ padding: '18px 20px 12px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Station code={from.code} name={from.name} time={departure} align="left" />
        <div style={{ flex: 1, paddingTop: 4 }}>
          <div style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', border: '2.5px solid var(--teal-500)', background: 'var(--white)', flex: '0 0 9px' }} />
            <div style={{ flex: 1, height: 6, margin: '0 2px', borderRadius: 3, background: 'var(--teal-200)', backgroundImage: 'repeating-linear-gradient(90deg, var(--teal-500) 0 2px, transparent 2px 7px)' }} />
            <i className="fas fa-train" style={{ color: 'var(--teal-600)', fontSize: 15, margin: '0 3px' }} />
            <div style={{ flex: 1, height: 6, margin: '0 2px', borderRadius: 3, background: 'var(--teal-200)', backgroundImage: 'repeating-linear-gradient(90deg, var(--teal-500) 0 2px, transparent 2px 7px)' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--teal-500)', flex: '0 0 9px' }} />
          </div>
          {duration && <div style={{ textAlign: 'center', marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-faint)' }}>{duration}</div>}
        </div>
        <Station code={to.code} name={to.name} time={arrival} align="right" />
      </div>

      <div style={{ padding: '4px 20px 0', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {coachClass && <Field k="CLASS" v={coachClass} />}
        {coach && <Field k="COACH" v={coach} mono />}
        {seat && <Field k="SEAT" v={seat} mono />}
        {platform ? <Field k="PLATFORM" v={platform} mono /> : null}
        {travellers != null && <Field k="TRAVELLERS" v={String(travellers)} />}
        {(pnr || bookingRef) && <Field k={pnr ? 'PNR' : 'BOOKING REF'} v={(pnr || bookingRef)!} mono />}
      </div>

      <div style={{ marginTop: 14, padding: '10px 20px', borderTop: '1px dashed var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--ink-50)' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          <i className="fas fa-circle-info" style={{ marginRight: 6, color: 'var(--text-faint)' }} />
          Source: <span style={{ fontWeight: 600, color: 'var(--text-body)' }}>{source}</span>
        </span>
        {platform ? null : <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Platform TBA</span>}
      </div>
    </div>
  )
}

function Station({ code, name, time, align }: { code: string; name: string; time?: string; align: 'left' | 'right' }) {
  return (
    <div style={{ textAlign: align, minWidth: 76, maxWidth: 130 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1 }}>{code}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.25 }}>{name}</div>
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
