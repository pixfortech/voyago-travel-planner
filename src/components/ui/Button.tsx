import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
          {
            primary:
              'bg-primary-500 text-white hover:bg-primary-600 shadow-sm shadow-primary-200',
            secondary:
              'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ghost: 'text-gray-600 hover:bg-gray-100',
            danger: 'bg-red-500 text-white hover:bg-red-600',
          }[variant],
          {
            sm: 'px-3 py-1.5 text-sm',
            md: 'px-4 py-2.5 text-sm',
            lg: 'px-6 py-3 text-base',
          }[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export default Button
