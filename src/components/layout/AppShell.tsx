'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import Header from './Header'
import BottomNav from './BottomNav'
import TripSubNav from './TripSubNav'
import { useApp } from '@/context/AppContext'
import FirebaseSetupBanner from '@/components/ui/FirebaseSetupBanner'

interface AppShellProps {
  children: ReactNode
  title?: string
  back?: string
  actions?: React.ReactNode
  tripId?: string
  hideNav?: boolean
  /** Use a wider content area (max-w-7xl) for grid-heavy pages like Dashboard. */
  wide?: boolean
}

export default function AppShell({
  children,
  title,
  back,
  actions,
  tripId,
  hideNav,
  wide,
}: AppShellProps) {
  const { authSetupError } = useApp()

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--background)' }}>
      <Header title={title} back={back} actions={actions} />
      {tripId && <TripSubNav tripId={tripId} />}
      <main
        className={cn(
          'flex-1 w-full mx-auto px-4 lg:px-8 pt-4',
          wide ? 'max-w-7xl' : 'max-w-3xl',
          hideNav ? 'pb-8' : 'pb-24 lg:pb-8'
        )}
      >
        {authSetupError ? (
          <FirebaseSetupBanner error={authSetupError} />
        ) : (
          children
        )}
      </main>
      {!hideNav && <BottomNav tripId={tripId} />}
    </div>
  )
}
