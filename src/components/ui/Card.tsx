import { type HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('bg-white rounded-2xl shadow-sm border border-gray-100', className)}
      {...props}
    >
      {children}
    </div>
  )
)
Card.displayName = 'Card'

export default Card
