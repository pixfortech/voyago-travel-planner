import { type CSSProperties, type ReactNode } from 'react'

const TONES: Record<string, { fg: string; bg: string; bd: string; icon: string }> = {
  warn:    { fg: 'var(--sun-600)',   bg: 'var(--sun-50)',    bd: '#F4E2A8', icon: 'triangle-exclamation' },
  danger:  { fg: 'var(--coral-700)', bg: 'var(--coral-50)',  bd: '#F8C9C1', icon: 'circle-exclamation' },
  info:    { fg: 'var(--sky-600)',   bg: 'var(--sky-50)',    bd: '#BFE4F8', icon: 'circle-info' },
  success: { fg: 'var(--green-600)', bg: 'var(--green-100)', bd: '#AEE6C6', icon: 'circle-check' },
}

interface Props {
  tone?: 'warn' | 'danger' | 'info' | 'success'
  title?: string
  children?: ReactNode
  icon?: string
  action?: string
  onAction?: () => void
  onDismiss?: () => void
  style?: CSSProperties
}

/** Flat advisory banner for route/timing warnings and save-validation notices. */
export default function WarningBanner({ tone = 'warn', title, children, icon, action, onAction, onDismiss, style }: Props) {
  const t = TONES[tone] ?? TONES.warn
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, fontFamily: 'var(--font-sans)',
        background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 'var(--radius-md)', padding: '12px 14px',
        ...style,
      }}
    >
      <i className={'fas fa-' + (icon || t.icon)} style={{ color: t.fg, fontSize: 16, marginTop: 1, flex: '0 0 auto' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-strong)', marginBottom: children ? 3 : 0 }}>{title}</div>}
        {children && <div style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-body)' }}>{children}</div>}
        {action && (
          <button onClick={onAction} style={{ marginTop: 9, border: 'none', cursor: 'pointer', background: t.fg, color: 'var(--white)', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13, padding: '7px 13px', borderRadius: 'var(--radius-sm)' }}>{action}</button>
        )}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.fg, fontSize: 14, opacity: 0.7, flex: '0 0 auto' }}>
          <i className="fas fa-xmark" />
        </button>
      )}
    </div>
  )
}
