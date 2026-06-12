'use client'

import { useLayout } from '@/context/LayoutContext'

interface LogoProps {
  /** 'wordmark' shows the full mark + word; 'mark' shows just the squircle. */
  variant?: 'wordmark' | 'mark'
  white?: boolean
  height?: number
  className?: string
}

/**
 * Voyago brand logo. Interim placeholder assets live at the single central
 * path `/public/brand/` — replace those three SVGs (same filenames + viewBox)
 * to adopt an official mark everywhere at once.
 *
 * In the classic layout we keep the original "VoyaGO" wordmark text so the old
 * look is preserved exactly.
 */
export default function Logo({ variant = 'wordmark', white = false, height = 30, className }: LogoProps) {
  const { isNewLayout } = useLayout()

  if (!isNewLayout) {
    return (
      <span className={`inline-flex items-baseline gap-0 select-none ${className ?? ''}`}>
        <span className="font-black bg-gradient-to-r from-primary-600 to-teal-500 bg-clip-text text-transparent tracking-tight" style={{ fontSize: height * 0.6 }}>
          Voya
        </span>
        <span className="font-black tracking-tight" style={{ fontSize: height * 0.6, color: white ? '#fff' : 'var(--foreground)' }}>
          GO
        </span>
      </span>
    )
  }

  const src =
    variant === 'mark'
      ? '/brand/voyago-logomark.svg'
      : white
      ? '/brand/voyago-wordmark-white.svg'
      : '/brand/voyago-wordmark.svg'

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Voyago" height={height} style={{ height }} className={className} />
}
