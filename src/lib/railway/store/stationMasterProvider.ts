/**
 * Station-master provider (Phase 4) — server-only resolution + cache.
 *
 * Resolves the active station master in priority order:
 *   1. Firestore imported master   (when Admin is configured AND populated)
 *   2. Generated JSON snapshot      (committed dev/offline import output)
 *   3. Curated 182-station seed     (always-available last resort)
 *
 * Cached in-process with a short TTL so search requests don't hammer Firestore.
 * The chosen tier is reported so the API/UI can show data provenance.
 */

import 'server-only'
import { isAdminConfigured } from '@/lib/firebaseAdmin'
import { seedAsMasterRecords } from '@/lib/railway/import/enrichGeo'
import type { StationMasterRecord } from '@/lib/railway/import/types'
import generatedStations from '@/data/railway/generated/stations.generated.json'

export type MasterTier = 'firestore' | 'generated_json' | 'curated_seed'

interface CacheEntry {
  tier: MasterTier
  records: StationMasterRecord[]
  loadedAt: number
}

const TTL_MS = 5 * 60 * 1000
let cache: CacheEntry | null = null

function generatedRecords(): StationMasterRecord[] {
  return Array.isArray(generatedStations) ? (generatedStations as StationMasterRecord[]) : []
}

/** Force the next `getStationMaster` to re-resolve (e.g. right after an import). */
export function invalidateStationMasterCache(): void {
  cache = null
}

/**
 * Get the active station master + which tier it came from. Falls through to the
 * curated seed so search ALWAYS returns useful results, even with no backend.
 */
export async function getStationMaster(): Promise<{ tier: MasterTier; records: StationMasterRecord[] }> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) {
    return { tier: cache.tier, records: cache.records }
  }

  // 1. Firestore imported master.
  if (isAdminConfigured()) {
    try {
      const { loadStationMaster } = await import('./firestoreStationStore')
      const records = await loadStationMaster()
      if (records.length > 0) {
        cache = { tier: 'firestore', records, loadedAt: Date.now() }
        return { tier: 'firestore', records }
      }
    } catch {
      // Firestore unavailable — fall through to lower tiers.
    }
  }

  // 2. Generated JSON snapshot.
  const gen = generatedRecords()
  if (gen.length > 0) {
    cache = { tier: 'generated_json', records: gen, loadedAt: Date.now() }
    return { tier: 'generated_json', records: gen }
  }

  // 3. Curated seed.
  const seed = seedAsMasterRecords()
  cache = { tier: 'curated_seed', records: seed, loadedAt: Date.now() }
  return { tier: 'curated_seed', records: seed }
}
