'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Map, Wallet, Pencil, Share2, ChevronLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/** Desktop-only tab bar below the Header. Includes core tabs + Edit/Share + My Trips. */
export default function TripSubNav({ tripId }: { tripId: string }) {
  const pathname = usePathname()

  const coreTabs = [
    { href: `/trips/${tripId}`,           label: 'Overview',  icon: <LayoutDashboard size={15} />, exact: true },
    { href: `/trips/${tripId}/itinerary`, label: 'Itinerary', icon: <Map size={15} /> },
    { href: `/trips/${tripId}/budget`,    label: 'Budget',    icon: <Wallet size={15} /> },
  ]

  const actionTabs = [
    { href: `/trips/${tripId}/edit`,  label: 'Edit',  icon: <Pencil size={14} /> },
    { href: `/trips/${tripId}/share`, label: 'Share', icon: <Share2 size={14} /> },
  ]

  return (
    <nav className="hidden lg:block sticky top-14 z-20 bg-white border-b border-gray-100 shadow-sm shadow-black/[0.03]">
      <div className="px-6 xl:px-8 flex items-center justify-between">
        {/* Core navigation tabs */}
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
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
                )}
              >
                {tab.icon}
                {tab.label}
              </Link>
            )
          })}
        </div>

        {/* Right-side: Edit, Share, My Trips */}
        <div className="flex items-center gap-0.5">
          {actionTabs.map((tab) => {
            const active = pathname.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition-colors',
                  active
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                )}
              >
                {tab.icon}
                {tab.label}
              </Link>
            )
          })}
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <Link
            href="/dashboard"
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
          >
            <ChevronLeft size={14} />
            My Trips
          </Link>
        </div>
      </div>
    </nav>
  )
}
