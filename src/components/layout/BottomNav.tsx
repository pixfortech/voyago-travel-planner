'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Map, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  exact?: boolean
}

interface BottomNavProps {
  tripId?: string
}

export default function BottomNav({ tripId }: BottomNavProps) {
  const pathname = usePathname()

  const items: NavItem[] = tripId
    ? [
        {
          href: `/trips/${tripId}`,
          label: 'Overview',
          icon: <LayoutDashboard size={20} />,
          exact: true,
        },
        {
          href: `/trips/${tripId}/itinerary`,
          label: 'Itinerary',
          icon: <Map size={20} />,
        },
        {
          href: `/trips/${tripId}/budget`,
          label: 'Budget',
          icon: <Wallet size={20} />,
        },
      ]
    : [
        {
          href: '/dashboard',
          label: 'My Trips',
          icon: <LayoutDashboard size={20} />,
        },
      ]

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-100 safe-area-pb">
      <div className="max-w-3xl mx-auto px-3 flex">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} className="flex-1 flex justify-center py-1.5">
              <div
                className={cn(
                  'flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all text-xs font-medium',
                  active ? 'bg-primary-50 text-primary-600' : 'text-gray-400 hover:text-gray-600'
                )}
              >
                {item.icon}
                {item.label}
              </div>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
