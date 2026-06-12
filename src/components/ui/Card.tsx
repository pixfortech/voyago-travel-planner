import { type HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** solid (default) | glass | map | outline */
  variant?: 'solid' | 'glass' | 'map' | 'outline'
  interactive?: boolean
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'solid', interactive, children, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-card border',
        variant === 'glass' && 'vy-glass',
        variant === 'map' && 'vy-map-texture',
        interactive && 'transition-all duration-200 hover:-translate-y-[3px] hover:shadow-vy-hover cursor-pointer',
        className
      )}
      style={{
        backgroundColor: variant === 'glass' ? undefined : variant === 'map' ? undefined : 'var(--card)',
        borderColor: variant === 'outline' ? 'var(--border-subtle)' : 'var(--border-soft)',
        boxShadow: variant === 'outline' ? 'none' : 'var(--shadow-md)',
        color: 'var(--text-body)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
)
Card.displayName = 'Card'

export default Card
