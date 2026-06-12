'use client'

import { useLayout } from '@/context/LayoutContext'

/** Tiny, unobtrusive layout toggle — localStorage-persisted. */
export default function LayoutSwitch() {
  const { layout, toggleLayout } = useLayout()
  return (
    <button
      onClick={toggleLayout}
      title={layout === 'new' ? 'Switch to classic layout' : 'Switch to new layout'}
      className="hidden sm:flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--muted-foreground)] transition-colors select-none shrink-0"
    >
      {layout === 'new' ? 'Classic' : 'New UI'}
    </button>
  )
}
