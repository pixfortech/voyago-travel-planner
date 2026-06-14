/**
 * Station-master sync endpoint (Phase 5) — server-only, secured.
 *
 *   POST /api/admin/railway-sync   → run an import (Cloud Scheduler / GH Action)
 *   GET  /api/admin/railway-sync   → read the last import status (admin view)
 *
 * Auth: requires header `x-railway-sync-secret` to equal env RAILWAY_SYNC_SECRET.
 * If the secret is unset, the endpoint refuses to run (fail-closed) so it can
 * never be triggered anonymously.
 *
 * Source resolution (no aggressive scraping; egress must be permitted):
 *   • RAILWAY_SOURCE_URL  — fetch an official dump (CSV/JSON) over HTTPS, OR
 *   • RAILWAY_SOURCE_PATH — read a committed dump from the deployment filesystem.
 * If neither is set, returns a clear "no source configured" error — it NEVER
 * fabricates data.
 */

import { NextResponse } from 'next/server'
import { isAdminConfigured } from '@/lib/firebaseAdmin'
import { prepareImport } from '@/lib/railway/import/runImport'
import {
  upsertStationMaster,
  recordImportFailure,
  getImportStatus,
} from '@/lib/railway/store/firestoreStationStore'
import { invalidateStationMasterCache } from '@/lib/railway/store/stationMasterProvider'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(req: Request): boolean {
  const secret = process.env.RAILWAY_SYNC_SECRET
  if (!secret) return false
  return req.headers.get('x-railway-sync-secret') === secret
}

async function loadSourceContent(): Promise<{ content: string; key: string } | null> {
  const url = process.env.RAILWAY_SOURCE_URL
  if (url) {
    const res = await fetch(url, {
      headers: { 'user-agent': 'VoyagoTravelPlanner/1.0 (+station-master sync)' },
      // be polite; Cloud Run default timeouts apply
    })
    if (!res.ok) throw new Error(`source fetch failed: HTTP ${res.status}`)
    return { content: await res.text(), key: url }
  }
  const path = process.env.RAILWAY_SOURCE_PATH
  if (path) {
    const fs = await import('node:fs/promises')
    return { content: await fs.readFile(path, 'utf8'), key: path }
  }
  return null
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminConfigured()) return NextResponse.json({ error: 'firebase admin not configured' }, { status: 503 })
  const status = await getImportStatus()
  return NextResponse.json({ status })
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminConfigured()) return NextResponse.json({ error: 'firebase admin not configured' }, { status: 503 })

  let source: { content: string; key: string } | null
  try {
    source = await loadSourceContent()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'source load failed'
    await recordImportFailure(msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
  if (!source) {
    return NextResponse.json(
      { ok: false, error: 'no source configured — set RAILWAY_SOURCE_URL or RAILWAY_SOURCE_PATH' },
      { status: 400 },
    )
  }

  try {
    const sourceTag = source.key.endsWith('.json') ? 'OGD' : 'CRIS_RBS'
    const prepared = prepareImport(source.content, { source: sourceTag, sourceKey: source.key })
    if (prepared.records.length === 0) {
      const msg = `parsed 0 records (${prepared.parse.issues.length} issues) — refusing to wipe master`
      await recordImportFailure(msg, sourceTag)
      return NextResponse.json({ ok: false, error: msg }, { status: 422 })
    }
    const counts = await upsertStationMaster(prepared)
    invalidateStationMasterCache()
    return NextResponse.json({ ok: true, counts, categoryCounts: prepared.categoryCounts, issueCount: prepared.parse.issues.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'import failed'
    await recordImportFailure(msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
