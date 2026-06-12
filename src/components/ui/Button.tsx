import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2',
          {
            primary:
              'bg-gradient-to-r from-primary-500 to-teal-500 text-white hover:from-primary-600 hover:to-teal-600 shadow-md shadow-primary-500/20 hover:shadow-lg hover:shadow-primary-500/25 hover:-translate-y-px',
            secondary:
              'border text-[var(--foreground)] hover:bg-[var(--muted)] shadow-sm',
            ghost:
              'hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            danger:
              'bg-gradient-to-r from-red-500 to-rose-500 text-white hover:from-red-600 hover:to-rose-600 shadow-md shadow-red-500/20',
            outline:
              'border-2 border-primary-400 text-primary-600 hover:bg-primary-50',
          }[variant],
          variant === 'secondary'
            ? ''
            : '',
          {
            sm: 'px-3 py-1.5 text-sm',
            md: 'px-4 py-2.5 text-sm',
            lg: 'px-6 py-3 text-base',
          }[size],
          className
        )}
        style={
          variant === 'secondary'
            ? { backgroundColor: 'var(--card)', borderColor: 'var(--border)' }
            : undefined
        }
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export default Button
