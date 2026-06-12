import { type CSSProperties } from 'react'

interface Props {
  total?: number
  spent?: number
  currency?: string
  gradient?: 'brand' | 'sunset' | 'aurora' | 'mint' | 'candy'
  style?: CSSProperties
}

const GRAD: Record<string, string> = {
  brand: 'linear-gradient(135deg, #0EA5A0 0%, #38BDF8 100%)',
  sunset: 'linear-gradient(135deg, #FF6B5C 0%, #FF8C42 48%, #FFC83D 100%)',
  aurora: 'linear-gradient(135deg, #7B61FF 0%, #38BDF8 55%, #20C0B0 100%)',
  mint: 'linear-gradient(135deg, #20C0B0 0%, #34C77B 100%)',
  candy: 'linear-gradient(135deg, #FF6B5C 0%, #7B61FF 100%)',
}

/** Gradient budget summary with progress bar; turns coral when over. */
export default function BudgetMeter({ total = 0, spent = 0, currency = '₹', gradient = 'brand', style }: Props) {
  const pct = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0
  const over = spent > total && total > 0
  const remaining = total - spent
  const fmt = (n: number) => currency + Math.abs(n).toLocaleString('en-IN')

  return (
    <div
      style={{
        borderRadius: 'var(--radius-xl)', padding: '22px 24px', color: 'var(--white)',
        background: over ? 'linear-gradient(135deg, #ED4F3F, #FF8C42)' : GRAD[gradient],
        boxShadow: over ? 'var(--glow-coral)' : 'var(--shadow-lg)', fontFamily: 'var(--font-sans)', ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.14em', opacity: 0.92 }}>TRIP BUDGET</span>
        <i className="fas fa-wallet" style={{ opacity: 0.85 }} />
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', margin: '6px 0 14px' }}>{fmt(total)}</div>
      <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.28)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', borderRadius: 999, background: 'var(--white)', transition: 'width var(--dur-slow) var(--ease-out)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 13.5 }}>
        <span style={{ opacity: 0.92 }}>{fmt(spent)} spent</span>
        <span style={{ fontWeight: 700 }}>{over ? fmt(remaining) + ' over' : fmt(remaining) + ' left'}</span>
      </div>
    </div>
  )
}
