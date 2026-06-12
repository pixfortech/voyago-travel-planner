'use client'

/**
 * VyWorkspaceShell — Claude Design app shell (new layout only).
 *
 * Two variants, chosen by the `focus` prop (AppShell passes `hideNav`):
 *  - Sidebar workspace (default): left sidebar with the Voyago wordmark, a
 *    gradient "New trip" CTA, the product nav, and a real "Switch trip" list;
 *    a content header (title / back / actions) and the page body. Mobile keeps
 *    the existing BottomNav.
 *  - Focus shell (create-trip / new-trip flows): a sticky brand TopBar
 *    ("Create a trip with AI") over a paper canvas with centered content —
 *    matching the create-trip design screen.
 *
 * Chrome only. It renders whatever the page passes as children and never
 * touches trip state beyond reading the user's trips for the switcher.
 */

import { type ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useApp } from '@/context/AppContext'
import { getTrips } from '@/lib/firestore'
import Logo from '@/components/ui/Logo'
import BottomNav from './BottomNav'
import type { Trip } from '@/types'

interface Props {
  children: ReactNode
  title?: string
  back?: string
  actions?: ReactNode
  tripId?: string
  /** Focus mode (create-trip flows) — brand TopBar instead of the sidebar. */
  focus?: boolean
}

const GRADS = ['brand', 'sunset', 'mint', 'candy', 'aurora'] as const

export default function VyWorkspaceShell({ children, title, back, actions, tripId, focus }: Props) {
  const router = useRouter()

  if (focus) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--grad-paper, var(--paper))', fontFamily: 'var(--font-sans)' }}>
        <header
          style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px',
            borderBottom: '1px solid var(--border-soft)', background: 'rgba(255,255,255,0.82)',
            backdropFilter: 'var(--blur-md)', WebkitBackdropFilter: 'var(--blur-md)',
            position: 'sticky', top: 0, zIndex: 40,
          }}
        >
          <Link href="/dashboard" aria-label="Voyago home" style={{ display: 'inline-flex' }}>
            <Logo height={30} />
          </Link>
          <span style={{ width: 1, height: 22, background: 'var(--border-subtle)' }} />
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-strong)' }}>{title ?? 'Create a trip with AI'}</span>
          <button
            type="button" aria-label="Close"
            onClick={() => (back ? router.push(back) : router.back())}
            style={{ marginLeft: 'auto', width: 36, height: 36, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-soft)', background: 'var(--white)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}
          >
            <i className="fas fa-xmark" />
          </button>
        </header>
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 32px' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto' }}>{children}</div>
        </main>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--surface-page, var(--paper))', fontFamily: 'var(--font-sans)' }}>
      <DesktopSidebar tripId={tripId} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Mobile top bar */}
        <header
          className="vy-shell-topbar"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            borderBottom: '1px solid var(--border-soft)', background: 'var(--white)', position: 'sticky', top: 0, zIndex: 30,
          }}
        >
          {back ? (
            <Link href={back} aria-label="Back" style={{ color: 'var(--text-muted)', fontSize: 18, display: 'inline-flex' }}>
              <i className="fas fa-arrow-left" />
            </Link>
          ) : (
            <Logo height={26} />
          )}
          {title && <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>}
          {actions && <span style={{ marginLeft: 'auto' }}>{actions}</span>}
        </header>

        <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden', padding: '22px 24px 96px' }} className="vy-shell-main">
          {/* Desktop content header */}
          {(title || actions) && (
            <div className="vy-shell-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                {back && (
                  <Link href={back} aria-label="Back" style={{ width: 38, height: 38, flex: '0 0 38px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-soft)', background: 'var(--white)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
                    <i className="fas fa-arrow-left" />
                  </Link>
                )}
                {title && <h1 className="font-display" style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-strong)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>}
              </div>
              {actions && <div style={{ flex: '0 0 auto' }}>{actions}</div>}
            </div>
          )}
          {children}
        </main>
      </div>

      <BottomNav tripId={tripId} />

      {/* Hide the mobile top bar + duplicate desktop header at the right breakpoints */}
      <style>{`
        @media (min-width: 1024px) { .vy-shell-topbar { display: none !important; } }
        @media (max-width: 1023px) { .vy-shell-header { display: none !important; } .vy-shell-main { padding: 16px 16px 96px !important; } }
      `}</style>
    </div>
  )
}

function DesktopSidebar({ tripId }: { tripId?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useApp()
  const [trips, setTrips] = useState<Trip[]>([])

  useEffect(() => {
    if (!user) return
    let alive = true
    getTrips(user.uid).then((t) => { if (alive) setTrips(t) }).catch(() => {})
    return () => { alive = false }
  }, [user])

  // Per-trip nav resolves against the active trip (route param) or the first trip.
  const ctxTrip = tripId ?? trips[0]?.id
  const nav: { icon: string; label: string; href: string; match: (p: string) => boolean }[] = [
    { icon: 'compass', label: 'Dashboard', href: '/dashboard', match: (p) => p === '/dashboard' },
    { icon: 'route', label: 'Itinerary', href: ctxTrip ? `/trips/${ctxTrip}/itinerary` : '/dashboard', match: (p) => p.includes('/itinerary') },
    { icon: 'location-dot', label: 'Places', href: ctxTrip ? `/trips/${ctxTrip}/location` : '/dashboard', match: (p) => p.includes('/location') },
    { icon: 'wallet', label: 'Expenses', href: ctxTrip ? `/trips/${ctxTrip}/budget` : '/dashboard', match: (p) => p.includes('/budget') },
    { icon: 'images', label: 'Memories', href: ctxTrip ? `/trips/${ctxTrip}/memories` : '/dashboard', match: (p) => p.includes('/memories') },
    { icon: 'people-group', label: 'Collaborate', href: ctxTrip ? `/trips/${ctxTrip}/members` : '/dashboard', match: (p) => p.includes('/members') || p.includes('/share') },
  ]

  return (
    <aside
      className="vy-shell-sidebar"
      style={{
        width: 248, flex: '0 0 248px', background: 'var(--white)', borderRight: '1px solid var(--border-soft)',
        display: 'flex', flexDirection: 'column', padding: 20, gap: 20, position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}
    >
      <Link href="/dashboard" aria-label="Voyago home" style={{ display: 'inline-flex', alignSelf: 'flex-start' }}>
        <Logo height={34} />
      </Link>

      <button
        type="button"
        onClick={() => router.push('/trips/new/ai-generator')}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', padding: '11px 14px',
          border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 14.5,
          color: '#fff', background: 'var(--grad-brand)', boxShadow: 'var(--glow-teal)',
        }}
      >
        <i className="fas fa-plus" /> New trip
      </button>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {nav.map((n) => {
          const on = n.match(pathname)
          return (
            <Link
              key={n.label} href={n.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--radius-md)',
                background: on ? 'var(--teal-50)' : 'transparent', color: on ? 'var(--teal-700)' : 'var(--text-body)',
                fontWeight: on ? 700 : 500, fontSize: 14.5, textDecoration: 'none',
              }}
            >
              <i className={'fas fa-' + n.icon} style={{ width: 18, textAlign: 'center', color: on ? 'var(--teal-500)' : 'var(--text-faint)' }} />
              {n.label}
            </Link>
          )
        })}
      </nav>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-faint)' }}>SWITCH TRIP</div>
        {trips.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-faint)' }}>No trips yet.</p>
        ) : (
          trips.slice(0, 5).map((t, i) => {
            const active = tripId === t.id
            return (
              <Link
                key={t.id} href={`/trips/${t.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--radius-md)', textDecoration: 'none',
                  border: active ? '1.5px solid var(--teal-300)' : '1px solid var(--border-soft)',
                  background: active ? 'var(--teal-50)' : 'var(--white)',
                }}
              >
                <span style={{ width: 28, height: 28, flex: '0 0 28px', borderRadius: 8, background: `var(--grad-${GRADS[i % GRADS.length]})` }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.destination}</span>
                </span>
              </Link>
            )
          })
        )}
      </div>

      <style>{`@media (max-width: 1023px) { .vy-shell-sidebar { display: none !important; } }`}</style>
    </aside>
  )
}
