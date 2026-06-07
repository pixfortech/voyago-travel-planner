/**
 * Maps status endpoint — GET /api/maps/status (Phase 6).
 *
 * Reports whether maps features are usable in this environment so the client can
 * choose between the Google place picker / route planner and the manual
 * fallback. It performs NO Google API call and never reveals the API key value.
 */

import { NextResponse } from 'next/server'
import { isFeatureEnabled } from '@/lib/flags'
import { isMapsServerConfigured } from '@/lib/maps/googleServer'
import { rateLimit, clientKey } from '@/lib/server/rateLimit'
import type { MapsStatus } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limit = rateLimit(`maps-status:${clientKey(request)}`, 60, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterMs: limit.retryAfterMs },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } }
    )
  }

  const featureEnabled = isFeatureEnabled('mapFeatures')
  const configured = isMapsServerConfigured()
  const status: MapsStatus = {
    featureEnabled,
    configured,
    available: featureEnabled && configured,
  }
  return NextResponse.json(status)
}
