'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, MapPin, Star, X, Loader2, Pencil } from 'lucide-react'
import Input from '@/components/ui/Input'
import { priceLevelSymbol, formatRating } from '@/lib/maps/config'
import type { PlaceSearchResult } from '@/types'

/** The place fields a selected activity stores. */
export interface SelectedPlace {
  placeId: string
  placeName: string
  placeAddress: string
  placeRating?: number
  placeUserRatingsTotal?: number
  priceLevel?: number
  lat: number
  lng: number
  /** Google place types forwarded for category auto-suggestion. */
  placeTypes?: string[]
}

interface PlacePickerProps {
  /** Whether the Google place search is usable. When false, only manual entry shows. */
  available: boolean
  locationName: string
  onLocationNameChange: (value: string) => void
  selectedPlace: SelectedPlace | null
  onSelectPlace: (place: SelectedPlace) => void
  onClearPlace: () => void
}

export default function PlacePicker({
  available,
  locationName,
  onLocationNameChange,
  selectedPlace,
  onSelectPlace,
  onClearPlace,
}: PlacePickerProps) {
  const [mode, setMode] = useState<'search' | 'manual'>(available ? 'search' : 'manual')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced search against our server route (which holds the Google key).
  useEffect(() => {
    if (mode !== 'search' || selectedPlace) return
    if (query.trim().length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSearching(true)
    setError('')
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/maps/places/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query.trim() }),
        })
        if (res.status === 503) {
          // Maps became unavailable — fall back to manual entry.
          setMode('manual')
          return
        }
        if (!res.ok) throw new Error('search_failed')
        const data = (await res.json()) as { results: PlaceSearchResult[] }
        setResults(data.results)
      } catch {
        setError('Search is unavailable right now — you can enter a location manually.')
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, mode, selectedPlace])

  function handlePick(p: PlaceSearchResult) {
    onSelectPlace({
      placeId: p.placeId,
      placeName: p.name,
      placeAddress: p.address,
      placeRating: p.rating,
      placeUserRatingsTotal: p.userRatingsTotal,
      priceLevel: p.priceLevel,
      lat: p.lat,
      lng: p.lng,
      placeTypes: p.types,
    })
    setQuery('')
    setResults([])
  }

  // ── Selected place card ──
  if (selectedPlace) {
    const rating = formatRating(selectedPlace.placeRating)
    const price = priceLevelSymbol(selectedPlace.priceLevel)
    return (
      <div>
        <p className="text-sm font-medium text-gray-700 mb-1.5">Location</p>
        <div className="flex items-start gap-2.5 rounded-xl border border-primary-200 bg-primary-50/50 p-3">
          <MapPin size={16} className="text-primary-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{selectedPlace.placeName}</p>
            {selectedPlace.placeAddress && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{selectedPlace.placeAddress}</p>
            )}
            {(rating || price) && (
              <div className="flex items-center gap-2 mt-1">
                {rating && (
                  <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600">
                    <Star size={11} className="fill-amber-400 text-amber-400" /> {rating}
                    {selectedPlace.placeUserRatingsTotal != null && (
                      <span className="text-gray-400 font-normal">
                        ({selectedPlace.placeUserRatingsTotal})
                      </span>
                    )}
                  </span>
                )}
                {price && <span className="text-xs font-semibold text-gray-500">{price}</span>}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClearPlace}
            className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
            aria-label="Remove selected place"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    )
  }

  // ── Manual entry ──
  if (mode === 'manual' || !available) {
    return (
      <div>
        <Input
          label="Location (optional)"
          placeholder="e.g. Colaba, Mumbai"
          value={locationName}
          onChange={(e) => onLocationNameChange(e.target.value)}
        />
        {available && (
          <button
            type="button"
            onClick={() => { setMode('search'); setError('') }}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors"
          >
            <Search size={12} /> Search Google Places instead
          </button>
        )}
      </div>
    )
  }

  // ── Google place search ──
  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-1.5">Location</p>
      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search places, hotels, restaurants…"
          className="w-full pl-9 pr-9 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent focus:bg-white transition-all text-sm"
        />
        {searching && (
          <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-1.5 border border-gray-100 rounded-xl divide-y divide-gray-50 overflow-hidden max-h-64 overflow-y-auto">
          {results.map((p) => {
            const rating = formatRating(p.rating)
            const price = priceLevelSymbol(p.priceLevel)
            return (
              <button
                key={p.placeId}
                type="button"
                onClick={() => handlePick(p)}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
              >
                <MapPin size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                  {p.address && <p className="text-xs text-gray-400 truncate">{p.address}</p>}
                  {(rating || price) && (
                    <div className="flex items-center gap-2 mt-0.5">
                      {rating && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600">
                          <Star size={10} className="fill-amber-400 text-amber-400" /> {rating}
                        </span>
                      )}
                      {price && <span className="text-xs font-semibold text-gray-400">{price}</span>}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-amber-600">{error}</p>}

      <button
        type="button"
        onClick={() => setMode('manual')}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
      >
        <Pencil size={12} /> Enter location manually
      </button>
    </div>
  )
}
