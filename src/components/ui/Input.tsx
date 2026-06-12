import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, style, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium mb-1.5"
            style={{ color: 'var(--foreground)' }}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'w-full px-4 py-3 rounded-xl border text-sm transition-all',
            'placeholder-[var(--muted-foreground)]',
            'focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent',
            error && 'border-red-400 focus:ring-red-400',
            className
          )}
          style={{
            backgroundColor: 'var(--muted)',
            borderColor: 'var(--border)',
            color: 'var(--foreground)',
            ...style,
          }}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

export default Input
