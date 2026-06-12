import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Legacy variants kept for compatibility, plus the Voyago tone names. */
  variant?:
    | 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'glass'
    | 'teal' | 'coral' | 'sun' | 'violet' | 'sky' | 'green' | 'orange' | 'neutral'
  size?: 'sm' | 'md'
  dot?: boolean
}

const TONES: Record<string, { fg: string; bg: string; solid: string }> = {
  teal:    { fg: 'var(--teal-700)',   bg: 'var(--teal-50)',   solid: 'var(--teal-500)' },
  coral:   { fg: 'var(--coral-700)',  bg: 'var(--coral-50)',  solid: 'var(--coral-500)' },
  sun:     { fg: 'var(--sun-600)',    bg: 'var(--sun-50)',    solid: 'var(--sun-400)' },
  violet:  { fg: 'var(--violet-700)', bg: 'var(--violet-50)', solid: 'var(--violet-500)' },
  sky:     { fg: 'var(--sky-600)',    bg: 'var(--sky-50)',    solid: 'var(--sky-400)' },
  green:   { fg: 'var(--green-600)',  bg: 'var(--green-100)', solid: 'var(--green-500)' },
  orange:  { fg: 'var(--orange-600)', bg: '#FFF1E6',          solid: 'var(--orange-500)' },
  neutral: { fg: 'var(--ink-700)',    bg: 'var(--ink-100)',   solid: 'var(--ink-700)' },
}

// Map legacy variant names onto Voyago tones.
const ALIAS: Record<string, string> = {
  default: 'neutral', primary: 'teal', success: 'green', warning: 'sun', danger: 'coral',
}

export default function Badge({ className, variant = 'default', size = 'md', dot, children, style, ...props }: BadgeProps) {
  if (variant === 'glass') {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5 rounded-full font-semibold text-white whitespace-nowrap', size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1', className)}
        style={{ background: 'rgba(255,255,255,0.22)', border: '1px solid rgba(255,255,255,0.35)', ...style }}
        {...props}
      >
        {children}
      </span>
    )
  }

  const tone = TONES[ALIAS[variant] ?? variant] ?? TONES.neutral

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap', size === 'sm' ? 'text-[11.5px] px-2 py-[3px]' : 'text-[12.5px] px-2.5 py-[5px]', className)}
      style={{ background: tone.bg, color: tone.fg, letterSpacing: '0.01em', ...style }}
      {...props}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.solid }} />}
      {children}
    </span>
  )
}
