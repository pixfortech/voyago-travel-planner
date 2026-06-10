'use client'

/**
 * SearchableSelect — Phase 16C.
 *
 * A small, dependency-free combobox: type to search a local dataset, pick a
 * result, or (optionally) keep a custom free-text value when nothing matches.
 * Data-shape agnostic via render callbacks so it is reused for cities, railway
 * stations and airports. Intentionally plain — visual polish is a later phase.
 */

import { useState } from 'react'
import { Search, X, MapPin, Check } from 'lucide-react'

interface SearchableSelectProps<T> {
  label: string
  placeholder?: string
  /** Returns dataset matches for the current query. */
  search: (query: string) => T[]
  getKey: (item: T) => string
  renderPrimary: (item: T) => string
  renderSecondary?: (item: T) => string
  onSelect: (item: T) => void
  /** When set, a selected-value card is shown instead of the search box. */
  selectedPrimary?: string | null
  selectedSecondary?: string | null
  /** Badge text shown on the selected card (e.g. "Google" or "Custom"). */
  selectedBadge?: string
  onClear?: () => void
  /** Allow keeping a typed value that isn't in the dataset. */
  allowCustom?: boolean
  onCustom?: (text: string) => void
  error?: string
}

export default function SearchableSelect<T>({
  label, placeholder, search, getKey, renderPrimary, renderSecondary, onSelect,
  selectedPrimary, selectedSecondary, selectedBadge, onClear,
  allowCustom = false, onCustom, error,
}: SearchableSelectProps<T>) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const trimmed = query.trim()
  const results = open && trimmed.length >= 1 ? search(trimmed) : []

  // ── Selected card ──
  if (selectedPrimary) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
        <div className="flex items-start gap-2.5 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
          <MapPin size={16} className="text-violet-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900 truncate">{selectedPrimary}</p>
              {selectedBadge && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 flex-shrink-0">{selectedBadge}</span>
              )}
            </div>
            {selectedSecondary && <p className="text-xs text-gray-500 mt-0.5 truncate">{selectedSecondary}</p>}
          </div>
          {onClear && (
            <button type="button" onClick={onClear}
              className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
              aria-label={`Clear ${label}`}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Search box ──
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:bg-white"
        />
      </div>

      {open && trimmed.length >= 1 && (
        <div className="mt-1.5 border border-gray-100 rounded-xl divide-y divide-gray-50 overflow-hidden max-h-64 overflow-y-auto">
          {results.map((item) => (
            <button
              key={getKey(item)}
              type="button"
              onClick={() => { onSelect(item); setQuery(''); setOpen(false) }}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
            >
              <MapPin size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{renderPrimary(item)}</p>
                {renderSecondary && <p className="text-xs text-gray-400 truncate">{renderSecondary(item)}</p>}
              </div>
            </button>
          ))}
          {allowCustom && onCustom && (
            <button
              type="button"
              onClick={() => { onCustom(trimmed); setQuery(''); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
            >
              <Check size={15} className="text-violet-400 flex-shrink-0" />
              <span className="text-sm text-gray-700">Use &ldquo;<strong>{trimmed}</strong>&rdquo; (custom)</span>
            </button>
          )}
          {results.length === 0 && !(allowCustom && onCustom) && (
            <p className="px-3 py-2.5 text-sm text-gray-400">No matches.</p>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
