/**
 * Station search API (Phase 6/9).
 *
 * GET /api/railway/stations/search?q=vasco&limit=8&filter=passenger
 *
 * Searches the resolved station master (Firestore → generated JSON → curated
 * seed) so the client dropdown can query the official master without bundling
 * thousands of rows. Returns compact rows + the data-provenance tier. Read-only,
 * no auth required (no sensitive data).
 */

import { NextResponse } from 'next/server'
import { getStationMaster } from '@/lib/railway/store/stationMasterProvider'
import { searchStationMaster, formatMasterLabel, type StationFilter } from '@/lib/railway/masterSearch'

export const dynamic = 'force-dynamic'

const VALID_FILTERS: StationFilter[] = ['all', 'passenger', 'major', 'active']

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').slice(0, 64)
  const limit = Math.min(25, Math.max(1, Number(searchParams.get('limit')) || 8))
  const filterParam = (searchParams.get('filter') ?? 'all') as StationFilter
  const filter = VALID_FILTERS.includes(filterParam) ? filterParam : 'all'

  try {
    const { tier, records } = await getStationMaster()
    const results = searchStationMaster(records, q, { limit, filter }).map((r) => ({
      code: r.stationCode,
      name: r.stationName,
      numericCode: r.stationNumericCode ?? null,
      state: r.state ?? null,
      city: r.city ?? null,
      zone: r.zone ?? null,
      division: r.division ?? null,
      label: formatMasterLabel(r),
      isActive: r.isActive,
      passengerRelevant: r.passengerRelevant ?? null,
      goodsOnly: r.goodsOnly ?? false,
      privateSiding: r.privateSiding ?? false,
      hasCoordinates: r.lat != null && r.lng != null,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      confidence: r.confidence ?? null,
    }))
    return NextResponse.json({ tier, count: results.length, results })
  } catch (err) {
    return NextResponse.json(
      { error: 'station search failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
