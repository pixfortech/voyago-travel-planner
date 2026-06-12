'use client'

import { type CSSProperties, useState } from 'react'
import TicketStatus, { normalizeStatus } from './TicketStatus'

interface Endpoint { code: string; city: string; time?: string }
interface Props {
  airline?: string
  flightNumber?: string
  from?: Endpoint
  to?: Endpoint
  date?: string
  duration?: string
  gate?: string
  seat?: string
  terminal?: string
  boardingTime?: string
  pnr?: string
  passengers?: number
  status?: string
  gradient?: 'brand' | 'sunset' | 'aurora' | 'mint' | 'candy'
  onClick?: () => void
  style?: CSSProperties
}

const GRAD: Record<string, string> = {
  brand: 'linear-gradient(135deg, #0EA5A0 0%, #38BDF8 100%)',
  sunset: 'linear-gradient(135deg, #FF6B5C 0%, #FF8C42 48%, #FFC83D 100%)',
  aurora: 'linear-gradient(135deg, #7B61FF 0%, #38BDF8 55%, #20C0B0 100%)',
  mint: 'linear-gradient(135deg, #20C0B0 0%, #34C77B 100%)',
  candy: 'linear-gradient(135deg, #FF6B5C 0%, #7B61FF 100%)',
}

/** Flight boarding pass — gradient header, mono codes, dotted plane route, stub. */
export default function FlightBoardingPass({
  airline = 'Flight', flightNumber = '', from = { code: '—', city: '' }, to = { code: '—', city: '' },
  date = '', duration, gate, seat, terminal, boardingTime, pnr, passengers,
  status = 'estimated', gradient = 'brand', onClick, style,
}: Props) {
  const [hover, setHover] = useState(false)
  const isStatus = !!normalizeStatus(status)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', borderRadius: 'var(--radius-xl)', overflow: 'hidden', background: 'var(--white)',
        boxShadow: hover ? 'var(--shadow-hover)' : 'var(--shadow-lg)',
        transform: hover ? 'translateY(-3px)' : 'none',
        transition: 'transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base)',
        cursor: onClick ? 'pointer' : 'default', fontFamily: 'var(--font-sans)', ...style,
      }}
    >
      <div style={{ background: GRAD[gradient], color: 'var(--white)', padding: '15px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
          <i className="fas fa-plane-up" style={{ fontSize: 15, opacity: 0.95 }} />
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>{airline}</span>
          {flightNumber && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, opacity: 0.9 }}>{flightNumber}</span>}
        </span>
        {isStatus && <TicketStatus status={status} onLight size="sm" />}
      </div>

      <div style={{ padding: '20px 22px 14px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <Endpoint code={from.code} city={from.city} time={from.time} align="left" />
        <div style={{ flex: 1, paddingTop: 6 }}>
          <div style={{ position: 'relative', height: 22, display: 'flex', alignItems: 'center' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal-400)', flex: '0 0 8px' }} />
            <div style={{ flex: 1, height: 3, borderRadius: 999, backgroundImage: 'repeating-linear-gradient(90deg, var(--teal-400) 0 7px, transparent 7px 14px)' }} />
            <i className="fas fa-plane" style={{ color: 'var(--coral-500)', fontSize: 18, margin: '0 4px' }} />
            <div style={{ flex: 1, height: 3, borderRadius: 999, backgroundImage: 'repeating-linear-gradient(90deg, var(--teal-400) 0 7px, transparent 7px 14px)' }} />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--coral-500)', flex: '0 0 8px' }} />
          </div>
          <div style={{ textAlign: 'center', marginTop: 7, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-faint)' }}>
            {date}{duration ? ' · ' + duration : ''}
          </div>
        </div>
        <Endpoint code={to.code} city={to.city} time={to.time} align="right" />
      </div>

      <Perforation />

      <div style={{ padding: '14px 22px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          {gate && <Stub k="GATE" v={gate} />}
          {terminal && <Stub k="TERMINAL" v={terminal} />}
          {seat && <Stub k="SEAT" v={seat} />}
          {boardingTime && <Stub k="BOARDS" v={boardingTime} />}
          {passengers != null && <Stub k="TRAVELLERS" v={String(passengers)} />}
          {pnr && <Stub k="PNR" v={pnr} mono />}
        </div>
        <i className="fas fa-qrcode" style={{ fontSize: 34, color: 'var(--ink-800)' }} />
      </div>
    </div>
  )
}

function Endpoint({ code, city, time, align }: { code: string; city: string; time?: string; align: 'left' | 'right' }) {
  return (
    <div style={{ textAlign: align, minWidth: 64 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1 }}>{code}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{city}</div>
      {time && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-body)', marginTop: 4, fontWeight: 700 }}>{time}</div>}
    </div>
  )
}

function Stub({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-faint)' }}>{k}</div>
      <div style={{ fontSize: 15, fontWeight: mono ? 700 : 600, color: 'var(--text-strong)', marginTop: 2, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)' }}>{v}</div>
    </div>
  )
}

function Perforation() {
  return (
    <div style={{ position: 'relative', height: 1, margin: '2px 0' }}>
      <div style={{ position: 'absolute', left: 14, right: 14, top: 0, borderTop: '2px dashed var(--ink-200)' }} />
      <span style={{ position: 'absolute', left: -10, top: -9, width: 18, height: 18, borderRadius: '50%', background: 'var(--surface-page)' }} />
      <span style={{ position: 'absolute', right: -10, top: -9, width: 18, height: 18, borderRadius: '50%', background: 'var(--surface-page)' }} />
    </div>
  )
}
