import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
}

export default function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
        {
          default: 'bg-gray-100 text-gray-600',
          primary: 'bg-primary-100 text-primary-700',
          success: 'bg-green-100 text-green-700',
          warning: 'bg-amber-100 text-amber-700',
          danger: 'bg-red-100 text-red-700',
        }[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
