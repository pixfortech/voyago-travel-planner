import { type InputHTMLAttributes, forwardRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, style, onFocus, onBlur, ...props }, ref) => {
    const [focus, setFocus] = useState(false)
    const borderColor = error
      ? 'var(--coral-500)'
      : focus
      ? 'var(--teal-500)'
      : 'var(--border-subtle)'

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-[13px] font-semibold mb-1.5" style={{ color: 'var(--text-body)' }}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          onFocus={(e) => { setFocus(true); onFocus?.(e) }}
          onBlur={(e) => { setFocus(false); onBlur?.(e) }}
          className={cn('w-full px-3.5 py-3 text-[15px] transition-all outline-none', className)}
          style={{
            background: 'var(--input-bg)',
            border: `1.5px solid ${borderColor}`,
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-strong)',
            boxShadow: focus ? (error ? 'var(--ring-focus-coral)' : 'var(--ring-focus)') : 'var(--shadow-xs)',
            ...style,
          }}
          {...props}
        />
        {error && <p className="mt-1 text-[12.5px]" style={{ color: 'var(--coral-600)' }}>{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

export default Input
