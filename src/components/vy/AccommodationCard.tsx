'use client'

import { type CSSProperties, useState } from 'react'
import TicketStatus, { normalizeStatus } from './TicketStatus'

const FALLBACKS: Record<string, string> = {
  teal: 'linear-gradient(150deg, #20C0B0, #169FE0)',
  sunset: 'linear-gradient(150deg, #FF8C42, #FF6B5C)',
  violet: 'linear-gradient(150deg, #7B61FF, #38BDF8)',
  mint: 'linear-gradient(150deg, #34C77B, #20C0B0)',
  sun: 'linear-gradient(150deg, #FFC83D, #FF8C42)',
}

interface Props {
  name?: string
  kind?: string
  location?: string
  image?: string
  fallback?: keyof typeof FALLBACKS
  checkIn?: string
  checkOut?: string
  nights?: number
  pricePerNight?: number
  total?: number
  currency?: string
  rating?: number
  amenities?: string[]
  status?: string
  onClick?: () => void
  style?: CSSProperties
}

/** Accommodation / stay card — media header, dates, amenities, price, trust status. */
export default function AccommodationCard({
  name = 'Stay', kind = 'Stay', location = '', image, fallback = 'sunset',
  checkIn, checkOut, nights, pricePerNight, total, currency = '₹', rating,
  amenities = [], status = 'estimated', onClick, style,
}: Props) {
  const [hover, setHover] = useState(false)
  const fmt = (n: number) => currency + Number(n).toLocaleString('en-IN')
  const isStatus = !!normalizeStatus(status)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', borderRadius: 'var(--radius-xl)', overflow: 'hidden', background: 'var(--white)',
        border: '1px solid var(--border-soft)',
        boxShadow: hover ? 'var(--shadow-hover)' : 'var(--shadow-md)',
        transform: hover ? 'translateY(-3px)' : 'none',
        transition: 'transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base)',
        cursor: onClick ? 'pointer' : 'default', fontFamily: 'var(--font-sans)', ...style,
      }}
    >
      <div style={{ position: 'relative', height: 124, background: FALLBACKS[fallback] || FALLBACKS.sunset, overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && <img src={image} alt={name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,12,16,0.5), transparent 60%)' }} />
        <div style={{ position: 'absolute', top: 12, left: 12 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-900)', background: 'rgba(255,255,255,0.92)', padding: '4px 11px', borderRadius: 'var(--radius-pill)' }}>
            <i className="fas fa-bed" style={{ marginRight: 6, color: 'var(--coral-500)' }} />{kind}
          </span>
        </div>
        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          {isStatus ? <TicketStatus status={status} size="sm" /> : null}
        </div>
        {rating != null && (
          <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.92)', padding: '4px 10px', borderRadius: 'var(--radius-pill)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink-900)' }}>
            <i className="fas fa-star" style={{ color: 'var(--sun-500)', fontSize: 11 }} />{rating}
          </div>
        )}
      </div>

      <div style={{ padding: '14px 18px 16px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--text-strong)' }}>{name}</div>
        {location && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
            <i className="fas fa-location-dot" style={{ color: 'var(--teal-500)', marginRight: 6 }} />{location}
          </div>
        )}

        {(checkIn || checkOut) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '10px 12px', background: 'var(--ink-50)', borderRadius: 'var(--radius-md)' }}>
            <DateBox k="CHECK-IN" v={checkIn} />
            <div style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>
              {nights ? nights + (nights === 1 ? ' night' : ' nights') : ''}
              <div style={{ height: 2, background: 'var(--border-subtle)', borderRadius: 2, margin: '5px 6px 0' }} />
            </div>
            <DateBox k="CHECK-OUT" v={checkOut} align="right" />
          </div>
        )}

        {amenities.length > 0 && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
            {amenities.map((a, i) => (
              <span key={i} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-body)', background: 'var(--white)', border: '1px solid var(--border-subtle)', padding: '5px 10px', borderRadius: 'var(--radius-pill)' }}>{a}</span>
            ))}
          </div>
        )}

        {(pricePerNight || total) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-soft)' }}>
            <div>
              {pricePerNight && <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: 'var(--text-strong)' }}>{fmt(pricePerNight)}<span style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 12.5, color: 'var(--text-muted)' }}> / night</span></div>}
            </div>
            {total != null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-faint)' }}>TOTAL</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 17, color: 'var(--teal-700)' }}>{fmt(total)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DateBox({ k, v, align = 'left' }: { k: string; v?: string; align?: 'left' | 'right' }) {
  return (
    <div style={{ textAlign: align }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-faint)' }}>{k}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-strong)', marginTop: 2 }}>{v || '—'}</div>
    </div>
  )
}
