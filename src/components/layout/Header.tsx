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
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
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
          <Link href="/" className="flex-1 flex items-center gap-1">
            <span className="text-lg font-black text-primary-600 tracking-tight">Voya</span>
            <span className="text-lg font-black text-gray-900 tracking-tight">GO</span>
          </Link>
        )}

        {actions}

        {!actions && !back && profile && (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: profile.color }}
          >
            {profile.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    </header>
  )
}
