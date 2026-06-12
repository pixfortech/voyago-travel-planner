'use client'

/**
 * VyCitySelect — Claude Design "City, State" combobox.
 *
 * A small dependency-free combobox over the local India city dataset
 * (`searchCities`). Displays results as "City, State", returns the matched
 * IndiaCity, and optionally keeps a custom free-text value. Purely a
 * presentation wrapper — it owns no trip state; the caller decides what to do
 * with the picked city. Used by the new-layout create-trip brief form.
 */

import { useEffect, useRef, useState } from 'react'
import { type IndiaCity, searchCities } from '@/data/indiaCities'

interface Props {
  icon?: string
  placeholder?: string
  /** Current committed display value (e.g. "Goa, India"). */
  value?: string
  onSelect: (city: IndiaCity) => void
  /** Allow keeping a typed value that isn't in the dataset. */
  allowCustom?: boolean
  onCustom?: (text: string) => void
  onClear?: () => void
  error?: string
}

export default function VyCitySelect({
  icon = 'map-location-dot', placeholder, value, onSelect, allowCustom, onCustom, onClear, error,
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const trimmed = query.trim()
  const results = trimmed.length >= 1 ? searchCities(trimmed) : []

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Committed selected value — show as a pill the user can clear.
  if (value) {
    return (
      <div>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--white)', border: '1.5px solid var(--teal-300)',
            borderRadius: 'var(--radius-md)', padding: '11px 12px', boxShadow: 'var(--shadow-xs)',
          }}
        >
          <i className={'fas fa-' + icon} style={{ color: 'var(--teal-500)', fontSize: 14 }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {value}
          </span>
          {onClear && (
            <button
              type="button" onClick={onClear} aria-label="Clear"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 14, padding: 2 }}
            >
              <i className="fas fa-xmark" />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <i
          className={'fas fa-' + icon}
          style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--teal-500)', fontSize: 14, pointerEvents: 'none' }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          style={{
            width: '100%', padding: '11px 12px 11px 36px', fontSize: 14, fontFamily: 'var(--font-sans)',
            color: 'var(--text-strong)', background: 'var(--surface-sunk)', border: `1px solid ${error ? 'var(--coral-400)' : 'var(--border-soft)'}`,
            borderRadius: 'var(--radius-md)', outline: 'none',
          }}
        />
      </div>

      {open && trimmed.length >= 1 && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30,
            background: 'var(--white)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)', overflow: 'hidden', maxHeight: 280, overflowY: 'auto',
          }}
        >
          {results.map((c) => (
            <button
              key={`${c.city}-${c.state}`}
              type="button"
              onClick={() => { onSelect(c); setQuery(''); setOpen(false) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--teal-50)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <i className="fas fa-location-dot" style={{ color: 'var(--coral-500)', fontSize: 13 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{c.city}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{`, ${c.state}`}</span>
              </span>
            </button>
          ))}
          {allowCustom && onCustom && (
            <button
              type="button"
              onClick={() => { onCustom(trimmed); setQuery(''); setOpen(false) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                textAlign: 'left', border: 'none', borderTop: results.length ? '1px solid var(--border-subtle)' : 'none',
                background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              <i className="fas fa-check" style={{ color: 'var(--violet-500)', fontSize: 13 }} />
              <span style={{ fontSize: 13.5, color: 'var(--text-body)' }}>Use &ldquo;<strong>{trimmed}</strong>&rdquo;</span>
            </button>
          )}
          {results.length === 0 && !(allowCustom && onCustom) && (
            <p style={{ margin: 0, padding: '10px 12px', fontSize: 13.5, color: 'var(--text-faint)' }}>No matches.</p>
          )}
        </div>
      )}

      {error && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--coral-600)' }}>{error}</p>}
    </div>
  )
}
