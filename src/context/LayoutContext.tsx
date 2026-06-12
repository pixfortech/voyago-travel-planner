'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Layout = 'new' | 'classic'

interface LayoutContextValue {
  layout: Layout
  toggleLayout: () => void
  isNewLayout: boolean
}

const LayoutContext = createContext<LayoutContextValue>({
  layout: 'new',
  toggleLayout: () => {},
  isNewLayout: true,
})

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<Layout>('new')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const stored = localStorage.getItem('voyago-layout') as Layout | null
      if (stored === 'classic' || stored === 'new') setLayout(stored)
    } catch {}
  }, [])

  useEffect(() => {
    if (!mounted) return
    document.documentElement.dataset.layout = layout
    try {
      localStorage.setItem('voyago-layout', layout)
    } catch {}
  }, [layout, mounted])

  return (
    <LayoutContext.Provider
      value={{
        layout,
        toggleLayout: () => setLayout((l) => (l === 'new' ? 'classic' : 'new')),
        isNewLayout: layout === 'new',
      }}
    >
      {children}
    </LayoutContext.Provider>
  )
}

export const useLayout = () => useContext(LayoutContext)
