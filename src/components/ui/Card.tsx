import { type HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-xl border shadow-sm', className)}
      style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', ...style }}
      {...props}
    >
      {children}
    </div>
  )
)
Card.displayName = 'Card'

export default Card
