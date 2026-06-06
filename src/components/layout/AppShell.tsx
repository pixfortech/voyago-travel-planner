import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import Header from './Header'
import BottomNav from './BottomNav'

interface AppShellProps {
  children: ReactNode
  title?: string
  back?: string
  actions?: React.ReactNode
  tripId?: string
  hideNav?: boolean
}

export default function AppShell({
  children,
  title,
  back,
  actions,
  tripId,
  hideNav,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header title={title} back={back} actions={actions} />
      <main className={cn('flex-1 max-w-lg mx-auto w-full px-4 pt-4', hideNav ? 'pb-8' : 'pb-24')}>
        {children}
      </main>
      {!hideNav && <BottomNav tripId={tripId} />}
    </div>
  )
}
