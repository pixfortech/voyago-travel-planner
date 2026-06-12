'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Map, Wallet, CheckSquare, Pencil, Share2, ChevronLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function TripSubNav({ tripId }: { tripId: string }) {
  const pathname = usePathname()

  const coreTabs = [
    { href: `/trips/${tripId}`,           label: 'Overview',  icon: <LayoutDashboard size={15} />, exact: true },
    { href: `/trips/${tripId}/itinerary`, label: 'Itinerary', icon: <Map size={15} /> },
    { href: `/trips/${tripId}/budget`,    label: 'Budget',    icon: <Wallet size={15} /> },
    { href: `/trips/${tripId}/planning`,  label: 'Tasks',     icon: <CheckSquare size={15} /> },
  ]

  const actionTabs = [
    { href: `/trips/${tripId}/edit`,  label: 'Edit',  icon: <Pencil size={14} /> },
    { href: `/trips/${tripId}/share`, label: 'Share', icon: <Share2 size={14} /> },
  ]

  return (
    <nav
      className="hidden lg:block sticky top-14 z-20 border-b shadow-sm shadow-black/[0.03]"
      style={{ backgroundColor: 'var(--nav-bg)', borderColor: 'var(--nav-border)' }}
    >
      <div className="px-6 xl:px-8 flex items-center justify-between">
        <div className="flex">
          {coreTabs.map((tab) => {
            const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors',
                  active
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent hover:border-[var(--border)]'
                )}
                style={!active ? { color: 'var(--muted-foreground)' } : undefined}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--foreground)' }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--muted-foreground)' }}
              >
                {tab.icon}
                {tab.label}
              </Link>
            )
          })}
        </div>

        <div className="flex items-center gap-0.5">
          {actionTabs.map((tab) => {
            const active = pathname.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition-colors',
                  active ? 'bg-primary-50 text-primary-600' : 'hover:bg-[var(--muted)]'
                )}
                style={!active ? { color: 'var(--muted-foreground)' } : undefined}
              >
                {tab.icon}
                {tab.label}
              </Link>
            )
          })}
          <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--border)' }} />
          <Link
            href="/dashboard"
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-xl transition-colors hover:bg-[var(--muted)]"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <ChevronLeft size={14} />
            My Trips
          </Link>
        </div>
      </div>
    </nav>
  )
}
