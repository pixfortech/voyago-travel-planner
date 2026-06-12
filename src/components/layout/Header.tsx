'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import ProfileMenu from './ProfileMenu'
import NotificationBell from './NotificationBell'
import LayoutSwitch from '@/components/ui/LayoutSwitch'

interface HeaderProps {
  title?: string
  back?: string
  actions?: React.ReactNode
}

export default function Header({ title, back, actions }: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-30 border-b"
      style={{ backgroundColor: 'var(--nav-bg)', borderColor: 'var(--nav-border)' }}
    >
      <div className="w-full px-4 lg:px-8 h-14 flex items-center gap-3">
        {back && (
          <Link
            href={back}
            className="p-2 -ml-2 rounded-xl transition-colors flex-shrink-0"
            style={{ color: 'var(--muted-foreground)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--muted)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
          >
            <ArrowLeft size={20} />
          </Link>
        )}

        {title ? (
          <h1
            className="flex-1 font-semibold text-base truncate"
            style={{ color: 'var(--foreground)' }}
          >
            {title}
          </h1>
        ) : (
          <Link href="/" className="flex-1 flex items-center gap-0 select-none">
            <span className="text-lg font-black bg-gradient-to-r from-primary-600 to-teal-500 bg-clip-text text-transparent tracking-tight">
              Voya
            </span>
            <span
              className="text-lg font-black tracking-tight"
              style={{ color: 'var(--foreground)' }}
            >
              GO
            </span>
          </Link>
        )}

        {actions && <div className="flex items-center gap-0.5">{actions}</div>}

        <LayoutSwitch />
        <NotificationBell />
        <ProfileMenu />
      </div>
    </header>
  )
}
