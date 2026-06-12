'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import ProfileMenu from './ProfileMenu'
import NotificationBell from './NotificationBell'
import LayoutSwitch from '@/components/ui/LayoutSwitch'
import Logo from '@/components/ui/Logo'

interface HeaderProps {
  title?: string
  back?: string
  actions?: React.ReactNode
}

export default function Header({ title, back, actions }: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-md"
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
            className="flex-1 font-display font-bold text-base truncate"
            style={{ color: 'var(--foreground)' }}
          >
            {title}
          </h1>
        ) : (
          <Link href="/" className="flex-1 flex items-center select-none">
            <Logo height={28} />
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
