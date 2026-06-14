/**
 * Firestore station-master store (Phase 4/5/10) — server-only.
 *
 * Persists the imported station master to Firestore via the Admin SDK with:
 *   • batched writes (≤450/batch, throttled) — never one giant commit
 *   • incremental upsert: only writes records whose contentHash changed
 *   • stale deactivation: codes absent from the new dump are marked inactive
 *     (soft) rather than deleted, preserving history
 *   • an import-status document with counts, timings, and error details
 *
 * Collections:
 *   railwayStations/{stationCode}        — one doc per station
 *   railwayMeta/importStatus             — last import status (Phase 5)
 *
 * This module is imported ONLY by server routes / the import script. It never
 * runs at build time or on the client.
 */

import 'server-only'
import { getAdminFirestore } from '@/lib/firebaseAdmin'
import { IMPORTER_VERSION } from '@/lib/railway/import/runImport'
import type { StationMasterRecord, ImportCounts, ImportStatus } from '@/lib/railway/import/types'
import type { PreparedImport } from '@/lib/railway/import/runImport'

const STATIONS_COLLECTION = 'railwayStations'
const META_COLLECTION = 'railwayMeta'
const STATUS_DOC = 'importStatus'
const BATCH_SIZE = 450
const BATCH_PAUSE_MS = 120

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Read every station's code + contentHash so we can diff incrementally. */
async function loadExistingHashes(): Promise<Map<string, { hash?: string; active: boolean }>> {
  const db = getAdminFirestore()
  const snap = await db.collection(STATIONS_COLLECTION).select('contentHash', 'isActive').get()
  const map = new Map<string, { hash?: string; active: boolean }>()
  snap.forEach((doc) => map.set(doc.id, { hash: doc.get('contentHash'), active: !!doc.get('isActive') }))
  return map
}

/** Commit an array of write ops in throttled batches. */
async function commitInBatches(
  ops: { code: string; data: Record<string, unknown> | null }[],
): Promise<void> {
  const db = getAdminFirestore()
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const slice = ops.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    for (const op of slice) {
      const ref = db.collection(STATIONS_COLLECTION).doc(op.code)
      if (op.data === null) batch.set(ref, { isActive: false, deactivatedAt: new Date().toISOString() }, { merge: true })
      else batch.set(ref, op.data, { merge: true })
    }
    await batch.commit()
    if (i + BATCH_SIZE < ops.length) await sleep(BATCH_PAUSE_MS)
  }
}

/**
 * Upsert a prepared import into Firestore. Incremental: unchanged records are
 * skipped, missing-from-dump records are deactivated (not deleted). Writes an
 * import-status doc on completion.
 */
export async function upsertStationMaster(prepared: PreparedImport): Promise<ImportCounts> {
  const db = getAdminFirestore()
  const attemptAt = new Date().toISOString()
  await db.collection(META_COLLECTION).doc(STATUS_DOC).set({ lastAttemptAt: attemptAt }, { merge: true })

  const existing = await loadExistingHashes()
  const seen = new Set<string>()
  const ops: { code: string; data: Record<string, unknown> | null }[] = []
  const counts: ImportCounts = { parsed: prepared.parse.records.length, added: 0, updated: 0, unchanged: 0, removed: 0, deactivated: 0, skipped: 0 }

  for (const rec of prepared.records) {
    const code = rec.stationCode
    seen.add(code)
    const prev = existing.get(code)
    if (!prev) { ops.push({ code, data: rec as unknown as Record<string, unknown> }); counts.added++ }
    else if (prev.hash !== rec.contentHash) { ops.push({ code, data: rec as unknown as Record<string, unknown> }); counts.updated++ }
    else counts.unchanged++
  }

  // Deactivate codes that exist in Firestore but are absent from this dump.
  for (const [code, prev] of Array.from(existing.entries())) {
    if (!seen.has(code) && prev.active) { ops.push({ code, data: null }); counts.deactivated++ }
  }

  await commitInBatches(ops)

  const status: ImportStatus = {
    lastAttemptAt: attemptAt,
    lastSuccessfulImportAt: new Date().toISOString(),
    ok: true,
    source: prepared.parse.source,
    counts,
    categoryCounts: prepared.categoryCounts,
    error: null,
    issueCount: prepared.parse.issues.length,
    importerVersion: IMPORTER_VERSION,
  }
  await db.collection(META_COLLECTION).doc(STATUS_DOC).set(status)
  return counts
}

/** Record a failed import attempt (keeps last-successful for fallback). */
export async function recordImportFailure(error: string, source: ImportStatus['source'] = null): Promise<void> {
  const db = getAdminFirestore()
  await db.collection(META_COLLECTION).doc(STATUS_DOC).set(
    { lastAttemptAt: new Date().toISOString(), ok: false, error, source },
    { merge: true },
  )
}

/** Read the import-status doc (Phase 5 admin view). */
export async function getImportStatus(): Promise<ImportStatus | null> {
  const db = getAdminFirestore()
  const doc = await db.collection(META_COLLECTION).doc(STATUS_DOC).get()
  return doc.exists ? (doc.data() as ImportStatus) : null
}

/**
 * Load all ACTIVE station-master records from Firestore. Returns `[]` when the
 * collection is empty/unconfigured so callers can fall back to the seed.
 */
export async function loadStationMaster(activeOnly = false): Promise<StationMasterRecord[]> {
  const db = getAdminFirestore()
  let query = db.collection(STATIONS_COLLECTION) as FirebaseFirestore.Query
  if (activeOnly) query = query.where('isActive', '==', true)
  const snap = await query.get()
  const out: StationMasterRecord[] = []
  snap.forEach((doc) => out.push(doc.data() as StationMasterRecord))
  return out
}
