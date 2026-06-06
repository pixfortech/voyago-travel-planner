'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import ProfileMenu from './ProfileMenu'

interface HeaderProps {
  title?: string
  back?: string
  actions?: React.ReactNode
}

export default function Header({ title, back, actions }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100/80 shadow-sm shadow-black/[0.04]">
      <div className="w-full px-4 lg:px-8 h-14 flex items-center gap-3">
        {back && (
          <Link
            href={back}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} />
          </Link>
        )}

        {title ? (
          <h1 className="flex-1 font-bold text-gray-900 text-base truncate">{title}</h1>
        ) : (
          <Link href="/" className="flex-1 flex items-center gap-0.5 select-none">
            <span className="text-lg font-black bg-gradient-to-r from-primary-600 to-teal-500 bg-clip-text text-transparent tracking-tight">
              Voya
            </span>
            <span className="text-lg font-black text-gray-900 tracking-tight">GO</span>
          </Link>
        )}

        {/* Page-level actions (edit/share/delete on trip pages) */}
        {actions && <div className="flex items-center gap-0.5">{actions}</div>}

        {/* Profile avatar + menu — always present */}
        <ProfileMenu />
      </div>
    </header>
  )
}
