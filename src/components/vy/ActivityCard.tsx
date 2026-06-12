'use client'

import { type CSSProperties, useState } from 'react'

const CATEGORIES: Record<string, { icon: string; fg: string; bg: string }> = {
  food:     { icon: 'utensils', fg: 'var(--orange-600)', bg: '#FFF1E6' },
  sight:    { icon: 'camera-retro', fg: 'var(--violet-700)', bg: 'var(--violet-50)' },
  beach:    { icon: 'umbrella-beach', fg: 'var(--sky-600)', bg: 'var(--sky-50)' },
  hike:     { icon: 'mountain-sun', fg: 'var(--green-600)', bg: 'var(--green-100)' },
  transit:  { icon: 'route', fg: 'var(--teal-700)', bg: 'var(--teal-50)' },
  stay:     { icon: 'hotel', fg: 'var(--coral-700)', bg: 'var(--coral-50)' },
  activity: { icon: 'wand-magic-sparkles', fg: 'var(--teal-700)', bg: 'var(--teal-50)' },
}

interface Props {
  time?: string
  title: string
  category?: keyof typeof CATEGORIES
  location?: string
  duration?: string
  cost?: number | null
  currency?: string
  description?: string
  tips?: string[]
  defaultOpen?: boolean
  connector?: boolean
  /** Optional trailing badge node (e.g. status / verification). */
  badge?: React.ReactNode
  style?: CSSProperties
}

/** Itinerary activity card — time, category icon, expandable detail drawer. */
export default function ActivityCard({
  time = '', title, category = 'activity', location, duration, cost, currency = '₹',
  description, tips = [], defaultOpen = false, connector = true, badge, style,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const c = CATEGORIES[category] || CATEGORIES.activity
  const hasDetail = !!(description || tips.length)
  const fmt = (n: number) => currency + Number(n).toLocaleString('en-IN')

  return (
    <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--font-sans)', ...style }}>
      <div style={{ flex: '0 0 52px', textAlign: 'right', position: 'relative' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)' }}>{time}</span>
      </div>
      <div style={{ position: 'relative', flex: '0 0 18px', display: 'flex', justifyContent: 'center' }}>
        <span style={{ width: 14, height: 14, borderRadius: '50%', background: c.bg, border: `2.5px solid ${c.fg}`, marginTop: 3, zIndex: 1 }} />
        {connector && <span style={{ position: 'absolute', top: 18, bottom: -14, width: 0, borderLeft: '2px dotted var(--border-strong)' }} />}
      </div>

      <div style={{ flex: 1, marginBottom: 14, minWidth: 0 }}>
        <div
          onClick={() => hasDetail && setOpen(!open)}
          style={{ background: 'var(--white)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)', padding: '12px 14px', boxShadow: 'var(--shadow-sm)', cursor: hasDetail ? 'pointer' : 'default' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ width: 36, height: 36, flex: '0 0 36px', borderRadius: 'var(--radius-md)', background: c.bg, color: c.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
              <i className={'fas fa-' + c.icon} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text-strong)' }}>{title}</div>
              {(location || duration) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2, fontSize: 12.5, color: 'var(--text-muted)' }}>
                  {location && <span><i className="fas fa-location-dot" style={{ color: 'var(--teal-400)', marginRight: 4 }} />{location}</span>}
                  {duration && <span><i className="fas fa-clock" style={{ marginRight: 4 }} />{duration}</span>}
                </div>
              )}
            </div>
            {badge}
            {cost != null && <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: 'var(--text-strong)' }}>{fmt(cost)}</span>}
            {hasDetail && (
              <i className="fas fa-chevron-down" style={{ color: 'var(--text-faint)', fontSize: 13, marginLeft: 4, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-base) var(--ease-out)' }} />
            )}
          </div>

          {hasDetail && open && (
            <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px dashed var(--border-subtle)' }}>
              {description && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-body)' }}>{description}</p>}
              {tips.length > 0 && (
                <div style={{ marginTop: description ? 10 : 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {tips.map((t, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-body)' }}>
                      <i className="fas fa-lightbulb" style={{ color: 'var(--sun-500)', fontSize: 12, marginTop: 2 }} />
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
