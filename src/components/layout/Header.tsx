'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useApp } from '@/context/AppContext'

interface HeaderProps {
  title?: string
  back?: string
  actions?: React.ReactNode
}

export default function Header({ title, back, actions }: HeaderProps) {
  const { profile } = useApp()

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100/80 shadow-sm shadow-black/[0.04]">
      <div className="w-full px-4 lg:px-8 h-14 flex items-center gap-3">
        {back && (
          <Link
            href={back}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
        )}

        {title ? (
          <h1 className="flex-1 font-bold text-gray-900 text-base truncate">{title}</h1>
        ) : (
          <Link href="/" className="flex-1 flex items-center gap-0.5">
            <span className="text-lg font-black bg-gradient-to-r from-primary-600 to-teal-500 bg-clip-text text-transparent tracking-tight">
              Voya
            </span>
            <span className="text-lg font-black text-gray-900 tracking-tight">GO</span>
          </Link>
        )}

        {actions}

        {!actions && !back && profile && (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm"
            style={{ backgroundColor: profile.color }}
          >
            {profile.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    </header>
  )
}
