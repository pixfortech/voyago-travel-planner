'use client'

import { useEffect, useState } from 'react'
import type { MapsStatus } from '@/types'

// Module-level cache so the cheap status check runs at most once per page load,
// shared across every component that needs it.
let cached: MapsStatus | null = null
let inflight: Promise<MapsStatus> | null = null

async function fetchStatus(): Promise<MapsStatus> {
  if (cached) return cached
  if (!inflight) {
    inflight = fetch('/api/maps/status')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('status_failed'))))
      .then((s: MapsStatus) => {
        cached = s
        return s
      })
      .catch(() => {
        const fallback: MapsStatus = { featureEnabled: false, configured: false, available: false }
        cached = fallback
        return fallback
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/** Reports whether Google Maps features are usable. Fetches once, then caches. */
export function useMapsStatus(): { status: MapsStatus; loading: boolean } {
  const [status, setStatus] = useState<MapsStatus>(
    cached ?? { featureEnabled: false, configured: false, available: false }
  )
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    if (cached) {
      setStatus(cached)
      setLoading(false)
      return
    }
    let active = true
    fetchStatus().then((s) => {
      if (!active) return
      setStatus(s)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  return { status, loading }
}
