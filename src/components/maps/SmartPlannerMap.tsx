'use client'

/**
 * SmartPlannerMap — Phase 15B.
 *
 * Google Maps canvas for the Smart Planner page. Renders markers in different
 * colours per visit status, highlights the active marker, and draws an optional
 * route polyline. Falls back to a "Maps key not configured" placeholder when
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is absent (list view still fully functional).
 *
 * Only the PUBLIC browser key is used here — the server-only GOOGLE_MAPS_API_KEY
 * is never referenced and never reaches the client.
 */

import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { loadGoogleMaps, isBrowserMapsConfigured } from '@/lib/maps/mapsLoader'
import { decodePolyline } from '@/lib/maps/polyline'

export type SmartPlannerMarkerType =
  | 'current'     // user's GPS location — blue
  | 'confirmed'   // confirmed visited — emerald
  | 'likely'      // likely visited — sky
  | 'remaining'   // not yet visited — gray
  | 'suggested'   // AI-proposed new place — violet
  | 'skipped'     // user skipped — amber

export interface SmartPlannerMarker {
  id: string
  lat: number
  lng: number
  label: string
  type: SmartPlannerMarkerType
  sublabel?: string
}

interface SmartPlannerMapProps {
  markers: SmartPlannerMarker[]
  activeMarkerId?: string | null
  onSelectMarker?: (id: string) => void
  routePolyline?: string | null
  heightPx?: number
}

const COLORS: Record<SmartPlannerMarkerType, string> = {
  current:   '#3b82f6',
  confirmed: '#10b981',
  likely:    '#0ea5e9',
  remaining: '#6b7280',
  suggested: '#8b5cf6',
  skipped:   '#f59e0b',
}

const TYPE_LABEL: Record<SmartPlannerMarkerType, string> = {
  current:   'Your location',
  confirmed: 'Visited',
  likely:    'Likely visited',
  remaining: 'Remaining',
  suggested: 'AI suggested',
  skipped:   'Skipped',
}

const LEGEND_ORDER: SmartPlannerMarkerType[] = [
  'confirmed', 'likely', 'remaining', 'skipped', 'suggested', 'current',
]

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export default function SmartPlannerMap(props: SmartPlannerMapProps) {
  const { markers, heightPx = 320 } = props

  if (!isBrowserMapsConfigured()) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 text-gray-400"
        style={{ height: heightPx }}
      >
        <MapPin size={22} className="mb-2 opacity-30" />
        <p className="text-xs font-semibold">Map not configured</p>
        <p className="text-[11px] mt-0.5 opacity-70">Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable</p>
      </div>
    )
  }

  const presentTypes = new Set(markers.map((m) => m.type))

  return (
    <div>
      <MapCanvas {...props} />
      {markers.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 px-1">
          {LEGEND_ORDER.filter((t) => presentTypes.has(t)).map((t) => (
            <div key={t} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLORS[t] }}
              />
              <span className="text-[10px] text-gray-500">{TYPE_LABEL[t]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MapCanvas({
  markers,
  activeMarkerId,
  onSelectMarker,
  routePolyline,
  heightPx = 320,
}: SmartPlannerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapsRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylineRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoWinRef = useRef<any>(null)
  const onSelectRef = useRef(onSelectMarker)
  onSelectRef.current = onSelectMarker
  const markerKeyRef = useRef('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  // Load SDK and create map once.
  useEffect(() => {
    let cancelled = false
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled) return
        if (!maps || !containerRef.current) { setStatus('error'); return }
        mapsRef.current = maps
        mapRef.current = new maps.Map(containerRef.current, {
          center: { lat: 20.5937, lng: 78.9629 },
          zoom: 5,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
          backgroundColor: '#eef2f6',
        })
        infoWinRef.current = new maps.InfoWindow()
        markerKeyRef.current = ''
        setStatus('ready')
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => {
      cancelled = true
      for (const m of markersRef.current) m.setMap(null)
      markersRef.current = []
      if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null }
      infoWinRef.current?.close()
    }
  }, [])

  // Rebuild markers when the set changes.
  useEffect(() => {
    const maps = mapsRef.current
    const map = mapRef.current
    if (status !== 'ready' || !maps || !map) return
    const key = markers.map((m) => `${m.id}:${m.type}`).join('|')
    if (key === markerKeyRef.current) return
    markerKeyRef.current = key

    for (const m of markersRef.current) m.setMap(null)
    markersRef.current = []
    if (markers.length === 0) return

    markers.forEach((pt) => {
      const color = COLORS[pt.type]
      const isCurrent = pt.type === 'current'
      const marker = new maps.Marker({
        position: { lat: pt.lat, lng: pt.lng },
        map,
        title: pt.label,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: isCurrent ? 10 : 8,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: isCurrent ? 3 : 2,
        },
        zIndex: isCurrent ? 1000 : 1,
      })
      marker.addListener('click', () => {
        infoWinRef.current?.setContent(
          `<div style="font-family:system-ui;padding:2px 2px 6px;max-width:180px">` +
          `<div style="font-size:10px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px">${escapeHtml(TYPE_LABEL[pt.type])}</div>` +
          `<div style="font-size:13px;font-weight:700;color:#111827">${escapeHtml(pt.label)}</div>` +
          (pt.sublabel ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">${escapeHtml(pt.sublabel)}</div>` : '') +
          `</div>`,
        )
        infoWinRef.current?.open({ anchor: marker, map })
        onSelectRef.current?.(pt.id)
      })
      markersRef.current.push(marker)
    })

    if (markers.length === 1) {
      map.setCenter({ lat: markers[0]!.lat, lng: markers[0]!.lng })
      map.setZoom(14)
    } else {
      const bounds = new maps.LatLngBounds()
      markers.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }))
      map.fitBounds(bounds, 48)
    }
  }, [markers, status])

  // Highlight active marker.
  useEffect(() => {
    const maps = mapsRef.current
    if (status !== 'ready' || !maps) return
    markersRef.current.forEach((marker, i) => {
      const pt = markers[i]
      if (!pt) return
      const active = pt.id === activeMarkerId
      const color = COLORS[pt.type]
      marker.setIcon({
        path: maps.SymbolPath.CIRCLE,
        scale: active ? 14 : (pt.type === 'current' ? 10 : 8),
        fillColor: color,
        fillOpacity: 1,
        strokeColor: active ? color : '#ffffff',
        strokeWeight: active ? 5 : (pt.type === 'current' ? 3 : 2),
        strokeOpacity: active ? 0.35 : 1,
      })
      marker.setZIndex(active ? 2000 : pt.type === 'current' ? 1000 : 1)
    })
  }, [activeMarkerId, status, markers])

  // Draw route polyline.
  useEffect(() => {
    const maps = mapsRef.current
    const map = mapRef.current
    if (status !== 'ready' || !maps || !map) return
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null }
    if (!routePolyline || markers.length < 2) return
    const path = decodePolyline(routePolyline)
    if (path.length < 2) return
    polylineRef.current = new maps.Polyline({
      path,
      map,
      strokeColor: '#8b5cf6',
      strokeOpacity: 0.8,
      strokeWeight: 3,
      geodesic: false,
    })
  }, [routePolyline, status, markers])

  return (
    <div className="relative w-full rounded-2xl overflow-hidden" style={{ height: heightPx }}>
      <div ref={containerRef} className="absolute inset-0" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80">
          <div className="w-6 h-6 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-400 text-xs">
          Map failed to load
        </div>
      )}
    </div>
  )
}
