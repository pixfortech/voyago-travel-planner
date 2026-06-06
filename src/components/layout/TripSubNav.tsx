'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Map, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Desktop-only horizontal tab bar that appears below the Header for trip pages. */
export default function TripSubNav({ tripId }: { tripId: string }) {
  const pathname = usePathname()

  const tabs = [
    {
      href: `/trips/${tripId}`,
      label: 'Overview',
      icon: <LayoutDashboard size={16} />,
      exact: true,
    },
    { href: `/trips/${tripId}/itinerary`, label: 'Itinerary', icon: <Map size={16} /> },
    { href: `/trips/${tripId}/budget`, label: 'Budget', icon: <Wallet size={16} /> },
  ]

  return (
    <nav className="hidden lg:block sticky top-14 z-20 bg-white border-b border-gray-100 shadow-sm shadow-black/[0.03]">
      <div className="px-6 xl:px-8 flex gap-0">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors',
                active
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
              )}
            >
              {tab.icon}
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
