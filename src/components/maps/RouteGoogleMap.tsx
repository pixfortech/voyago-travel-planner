'use client'

/**
 * RouteGoogleMap — Phase 7E.
 *
 * Renders a real Google Maps canvas for Route Playback when the PUBLIC browser
 * key is configured. Draws a coloured marker per playback point, the exact road
 * polyline returned by Routes API (or a straight-line fallback), and keeps the
 * map in sync with the timeline: clicking a marker selects its point, the active
 * point is highlighted + panned to, and playback drives the highlight.
 *
 * Google Maps is manipulated imperatively (it is not a React renderer). All
 * objects live in refs and are reconciled in focused effects. If the SDK fails
 * to load, `onStatusChange('error')` lets the parent fall back to the SVG route.
 */

import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps, type GoogleMapsApi } from '@/lib/maps/mapsLoader'
import { decodePolyline } from '@/lib/maps/polyline'
import type { PlaybackPoint, PlaybackPointType } from '@/types'

export type MapRenderStatus = 'loading' | 'ready' | 'error'

interface RouteGoogleMapProps {
  points: PlaybackPoint[]
  activeIndex: number
  onSelectPoint: (index: number) => void
  /** Encoded road polyline matching the CURRENT point order, or null for approx. */
  encodedPolyline?: string | null
  colors: Record<PlaybackPointType, string>
  labels: Record<PlaybackPointType, string>
  onStatusChange?: (status: MapRenderStatus) => void
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtTime(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    })
  } catch {
    return ''
  }
}

function infoHtml(
  pt: PlaybackPoint,
  typeLabel: string,
  color: string,
): string {
  const time = fmtTime(pt.timestamp)
  const place =
    pt.activityCtx?.placeName ||
    pt.memoryCtx?.placeName ||
    pt.locationCtx?.note ||
    ''
  return (
    `<div style="font-family:system-ui,sans-serif;max-width:200px;padding:2px 2px 4px">` +
    `<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">` +
    `<span style="width:8px;height:8px;border-radius:9999px;background:${color};display:inline-block"></span>` +
    `<span style="font-size:10px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.03em">${escapeHtml(typeLabel)}</span>` +
    `</div>` +
    `<div style="font-size:13px;font-weight:700;color:#111827;line-height:1.25">${escapeHtml(pt.label)}</div>` +
    (time ? `<div style="font-size:11px;color:#6b7280;margin-top:1px">${escapeHtml(time)}</div>` : '') +
    (place ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">${escapeHtml(place)}</div>` : '') +
    `</div>`
  )
}

export default function RouteGoogleMap({
  points,
  activeIndex,
  onSelectPoint,
  encodedPolyline,
  colors,
  labels,
  onStatusChange,
}: RouteGoogleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Imperative Google objects.
  const mapsRef = useRef<GoogleMapsApi | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylineRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoWindowRef = useRef<any>(null)

  // Latest callback without forcing marker rebuilds.
  const onSelectRef = useRef(onSelectPoint)
  onSelectRef.current = onSelectPoint

  // Key describing the current marker set; markers rebuild only when it changes.
  const markerKeyRef = useRef('')

  const [status, setStatus] = useState<MapRenderStatus>('loading')

  function report(next: MapRenderStatus) {
    setStatus(next)
    onStatusChange?.(next)
  }

  // ── load SDK + create map ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    report('loading')

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled) return
        if (!maps || !containerRef.current) {
          report('error')
          return
        }
        mapsRef.current = maps
        mapRef.current = new maps.Map(containerRef.current, {
          center: { lat: 20.5937, lng: 78.9629 }, // India centroid; bounds override
          zoom: 5,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
          backgroundColor: '#eef2f6',
        })
        infoWindowRef.current = new maps.InfoWindow()
        markerKeyRef.current = '' // force first marker build
        report('ready')
      })
      .catch(() => {
        if (!cancelled) report('error')
      })

    return () => {
      cancelled = true
      for (const m of markersRef.current) m.setMap(null)
      markersRef.current = []
      if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null }
      if (infoWindowRef.current) { infoWindowRef.current.close() }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── build markers + fit bounds when the point set changes ───────────────
  useEffect(() => {
    const maps = mapsRef.current
    const map = mapRef.current
    if (status !== 'ready' || !maps || !map) return

    const key = points.map((p) => `${p.id}:${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join('|')
    if (key === markerKeyRef.current) return
    markerKeyRef.current = key

    // Clear previous markers.
    for (const m of markersRef.current) m.setMap(null)
    markersRef.current = []

    points.forEach((pt, i) => {
      const color = colors[pt.type]
      const marker = new maps.Marker({
        position: { lat: pt.latitude, lng: pt.longitude },
        map,
        title: pt.label,
        label: {
          text: String(i + 1),
          color: '#ffffff',
          fontSize: '10px',
          fontWeight: '700',
        },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        zIndex: i,
      })
      marker.addListener('click', () => onSelectRef.current(i))
      markersRef.current.push(marker)
    })

    // Fit bounds to all points.
    if (points.length === 1) {
      map.setCenter({ lat: points[0]!.latitude, lng: points[0]!.longitude })
      map.setZoom(14)
    } else if (points.length > 1) {
      const bounds = new maps.LatLngBounds()
      points.forEach((p) => bounds.extend({ lat: p.latitude, lng: p.longitude }))
      map.fitBounds(bounds, 48)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, status, colors])

  // ── highlight active marker + info window + pan ─────────────────────────
  useEffect(() => {
    const maps = mapsRef.current
    const map = mapRef.current
    if (status !== 'ready' || !maps || !map) return

    markersRef.current.forEach((marker, i) => {
      const pt = points[i]
      if (!pt) return
      const isActive = i === activeIndex
      const color = colors[pt.type]
      marker.setIcon({
        path: maps.SymbolPath.CIRCLE,
        scale: isActive ? 15 : 11,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: isActive ? color : '#ffffff',
        strokeWeight: isActive ? 4 : 2,
        strokeOpacity: isActive ? 0.45 : 1,
      })
      marker.setZIndex(isActive ? 1000 : i)
      marker.setAnimation(isActive ? maps.Animation.BOUNCE : null)
    })

    if (activeIndex >= 0 && markersRef.current[activeIndex] && points[activeIndex]) {
      const pt = points[activeIndex]!
      const marker = markersRef.current[activeIndex]
      if (infoWindowRef.current) {
        infoWindowRef.current.setContent(infoHtml(pt, labels[pt.type], colors[pt.type]))
        infoWindowRef.current.open({ anchor: marker, map })
      }
      map.panTo({ lat: pt.latitude, lng: pt.longitude })
    } else if (infoWindowRef.current) {
      infoWindowRef.current.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, status, points, colors, labels])

  // ── draw route polyline (exact road, or straight-line fallback) ─────────
  useEffect(() => {
    const maps = mapsRef.current
    const map = mapRef.current
    if (status !== 'ready' || !maps || !map) return

    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null }
    if (points.length < 2) return

    const roadPath = encodedPolyline ? decodePolyline(encodedPolyline) : []
    const usingRoad = roadPath.length >= 2

    const path = usingRoad
      ? roadPath
      : points.map((p) => ({ lat: p.latitude, lng: p.longitude }))

    if (usingRoad) {
      polylineRef.current = new maps.Polyline({
        path,
        map,
        strokeColor: '#14b8a6',
        strokeOpacity: 0.95,
        strokeWeight: 4,
        geodesic: false,
      })
    } else {
      // Dashed grey "approximate" line.
      polylineRef.current = new maps.Polyline({
        path,
        map,
        strokeOpacity: 0,
        geodesic: true,
        icons: [{
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: '#94a3b8', scale: 3 },
          offset: '0',
          repeat: '12px',
        }],
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encodedPolyline, points, status])

  return (
    <div className="relative w-full" style={{ height: 300 }}>
      <div ref={containerRef} className="absolute inset-0 rounded-xl overflow-hidden" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/70 rounded-xl">
          <div className="w-7 h-7 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
