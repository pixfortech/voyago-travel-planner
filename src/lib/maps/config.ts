/**
 * Google Maps — client-safe config & formatting helpers (Phase 6).
 *
 * This module contains NO secrets and is safe to import from client components.
 * It only reports whether the maps *feature flag* is on (a public flag) and
 * provides pure helpers for displaying place metadata. Whether a Google API key
 * is actually configured is a server-side fact, exposed to the client only via
 * GET /api/maps/status (which never reveals the key itself).
 */

import { isFeatureEnabled } from '@/lib/flags'

/** True when the public maps feature flag is enabled. */
export function mapsFeatureEnabled(): boolean {
  return isFeatureEnabled('mapFeatures')
}

/** Compact price-level indicator (Google levels 0–4). */
export function priceLevelSymbol(level: number | undefined): string | null {
  if (level == null || level < 0) return null
  if (level === 0) return 'Free'
  return '₹'.repeat(Math.min(level, 4))
}

export function priceLevelLabel(level: number | undefined): string | null {
  if (level == null || level < 0) return null
  return (
    ['Free', 'Inexpensive', 'Moderate', 'Expensive', 'Very expensive'][level] ?? null
  )
}

/** Round a rating to one decimal for display, or null if absent. */
export function formatRating(rating: number | undefined): string | null {
  if (rating == null || rating <= 0) return null
  return rating.toFixed(1)
}
