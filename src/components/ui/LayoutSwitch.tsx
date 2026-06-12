'use client'

import { useLayout } from '@/context/LayoutContext'

/** Tiny, unobtrusive layout toggle — localStorage-persisted. Visible on mobile too. */
export default function LayoutSwitch() {
  const { layout, toggleLayout } = useLayout()
  return (
    <button
      onClick={toggleLayout}
      title={layout === 'new' ? 'Switch to classic layout' : 'Switch to new layout'}
      aria-label={layout === 'new' ? 'Switch to classic layout' : 'Switch to new layout'}
      className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors select-none shrink-0"
      style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
    >
      {layout === 'new' ? 'Classic' : 'New UI'}
    </button>
  )
}
