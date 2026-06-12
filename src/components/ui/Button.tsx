import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'gradient'
  size?: 'sm' | 'md' | 'lg'
  /** Gradient name when variant='gradient' (Voyago signature gradients). */
  gradient?: 'brand' | 'sunset' | 'aurora' | 'candy' | 'mint'
}

const GRAD: Record<string, string> = {
  brand: 'linear-gradient(135deg, #0EA5A0 0%, #38BDF8 100%)',
  sunset: 'linear-gradient(135deg, #FF6B5C 0%, #FF8C42 48%, #FFC83D 100%)',
  aurora: 'linear-gradient(135deg, #7B61FF 0%, #38BDF8 55%, #20C0B0 100%)',
  candy: 'linear-gradient(135deg, #FF6B5C 0%, #7B61FF 100%)',
  mint: 'linear-gradient(135deg, #20C0B0 0%, #34C77B 100%)',
}

/**
 * Voyago Button — gradient + glow variants make important actions
 * (Generate AI plan, Create Trip, Optimise route) feel exciting.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', gradient = 'brand', children, style, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-semibold transition-all',
          'active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2',
          {
            primary:
              'bg-primary-500 text-white hover:bg-primary-600 shadow-[0_10px_26px_rgba(14,165,160,0.40)] hover:-translate-y-px',
            gradient:
              'text-white shadow-[0_10px_26px_rgba(14,165,160,0.40)] hover:-translate-y-px hover:saturate-[1.08] hover:brightness-[1.03]',
            secondary:
              'border text-[var(--text-strong)] hover:-translate-y-px shadow-vy-sm',
            ghost:
              'text-[var(--text-body)] hover:bg-[var(--muted)]',
            danger:
              'bg-coral-600 text-white hover:bg-coral-700 shadow-[0_10px_26px_rgba(255,107,92,0.42)]',
            outline:
              'border-2 border-primary-400 text-primary-600 hover:bg-primary-50',
          }[variant],
          {
            sm: 'px-3.5 py-2 text-sm rounded-[10px] gap-1.5',
            md: 'px-5 py-3 text-[15px] rounded-[14px] gap-2',
            lg: 'px-6 py-3.5 text-base rounded-[16px] gap-2.5',
          }[size],
          className
        )}
        style={{
          ...(variant === 'gradient' ? { backgroundImage: GRAD[gradient] } : {}),
          ...(variant === 'secondary' ? { backgroundColor: 'var(--card)', borderColor: 'var(--border-subtle)' } : {}),
          letterSpacing: '-0.01em',
          ...style,
        }}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export default Button
