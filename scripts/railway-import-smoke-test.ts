/**
 * Station-master import smoke test (Phase 11).
 *
 * Exercises the import pipeline end-to-end against the CRIS RBS SAMPLE fixture
 * (no network, no Firestore): parse → enrich → search → filters → nearest. Plus
 * a Firestore-safety check (no undefined values reach the prepared records).
 *
 * Compile + run (tsx not required):
 *   npx tsc scripts/railway-import-smoke-test.ts \
 *     --outDir /tmp/rwy-import --module commonjs --target es2020 \
 *     --moduleResolution node --esModuleInterop --resolveJsonModule --skipLibCheck
 *   node /tmp/rwy-import/scripts/railway-import-smoke-test.js
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { prepareImport } from '../src/lib/railway/import/runImport'
import { searchStationMaster, formatMasterLabel } from '../src/lib/railway/masterSearch'
import { nearestByCoords } from '../src/lib/railway/nearestStations'
import type { StationMasterRecord } from '../src/lib/railway/import/types'

let failures = 0
function check(label: string, cond: boolean, detail = ''): void {
  if (!cond) failures++
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`)
}

// ── Parse + enrich the sample fixture ────────────────────────────────────────
// Resolve from the repo root (cwd when run) so it works from a temp build dir.
const FIXTURE_REL = 'src/lib/railway/import/__fixtures__/cris-rbs-sample.csv'
const fixture = [
  path.resolve(process.cwd(), FIXTURE_REL),
  path.resolve(__dirname, '../' + FIXTURE_REL),
].find((p) => fs.existsSync(p))
if (!fixture) { console.error(`Fixture not found: ${FIXTURE_REL}`); process.exit(2) }
const csv = fs.readFileSync(fixture, 'utf8')
const prepared = prepareImport(csv, { source: 'CRIS_RBS', sourceKey: 'cris-rbs-sample.csv' })
const records: StationMasterRecord[] = prepared.records

console.log('\n── Parser ──')
check('parsed all 11 fixture rows', prepared.parse.records.length === 11, `parsed ${prepared.parse.records.length}`)
check('no parse issues on clean fixture', prepared.parse.issues.length === 0, `${prepared.parse.issues.length} issues`)
const mao = records.find((r) => r.stationCode === 'MAO')
check('MAO captured numeric code', mao?.stationNumericCode === '03126', mao?.stationNumericCode)
check('MAO gauge captured', mao?.gauge === 'BG')
check('MAO enriched with state=Goa (from curated geo)', mao?.state === 'Goa', mao?.state)
check('MAO enriched with coordinates', mao?.lat != null && mao?.lng != null)
check('MAO label correct', formatMasterLabel(mao!) === 'Madgaon Junction (MAO), Goa', mao ? formatMasterLabel(mao) : 'none')

console.log('\n── Active / traffic classification ──')
const old = records.find((r) => r.stationCode === 'XOLD1')
check('expired Valid To → inactive', old?.isActive === false, `isActive=${old?.isActive}`)
const goods = records.find((r) => r.stationCode === 'XGOODS1')
check('Goods traffic → goodsOnly', goods?.goodsOnly === true)
check('Goods traffic → not passengerRelevant', goods?.passengerRelevant === false)
check('Coaching traffic → passengerRelevant', mao?.passengerRelevant === true)

console.log('\n── Required Goa search cases (over imported master) ──')
function expectTop(query: string, code: string): void {
  const top = searchStationMaster(records, query, { limit: 8 })[0]
  check(`search "${query}" → ${code}`, top?.stationCode === code, top ? `${top.stationCode} (${formatMasterLabel(top)})` : 'no results')
}
expectTop('Vasco', 'VSG')
expectTop('Vasco Da Gama', 'VSG')
expectTop('Vasco-da-Gama', 'VSG')
expectTop('VSG', 'VSG')
expectTop('Madgaon', 'MAO')
expectTop('Margao', 'MAO') // alias merged from curated geo
expectTop('MAO', 'MAO')
expectTop('03126', 'MAO') // numeric code search
expectTop('Karmali', 'KRMI')
expectTop('KRMI', 'KRMI')
expectTop('Thivim', 'THVM')
expectTop('THVM', 'THVM')
expectTop('Pernem', 'PERN')
expectTop('PERN', 'PERN')
expectTop('Canacona', 'CNO')
expectTop('CNO', 'CNO')
expectTop('Kulem', 'QLM')
expectTop('QLM', 'QLM')

console.log('\n── Filters ──')
const passengerResults = searchStationMaster(records, '', { filter: 'passenger', limit: 50 })
check('passenger filter excludes goods yard', !passengerResults.some((r) => r.stationCode === 'XGOODS1'))
const activeResults = searchStationMaster(records, '', { filter: 'active', limit: 50 })
check('active filter excludes decommissioned halt', !activeResults.some((r) => r.stationCode === 'XOLD1'))

console.log('\n── Nearest station (Panaji 15.4909,73.8278) over imported master ──')
const near = nearestByCoords(15.4909, 73.8278, records, { maxDistanceKm: 120, limit: 10 })
const nearCodes = near.map((n) => n.item.stationCode)
check('Panaji nearby includes Goa Konkan stations', ['MAO', 'VSG', 'KRMI', 'THVM'].some((c) => nearCodes.includes(c)), nearCodes.join(', '))
check('nearest result is within Goa', near[0] != null && near[0].distanceKm < 60, near[0] ? `${near[0].item.stationCode} @ ${near[0].distanceKm}km` : 'none')

console.log('\n── Firestore safety (no undefined in prepared records) ──')
const hasUndefined = records.some((r) => Object.values(r).some((v) => v === undefined))
check('no undefined values in any prepared record', !hasUndefined)
check('every record has a contentHash (incremental upsert)', records.every((r) => typeof r.contentHash === 'string' && r.contentHash.length > 0))

console.log('\n── Category counts ──')
console.log(`  total=${prepared.categoryCounts.total} active=${prepared.categoryCounts.active} passenger=${prepared.categoryCounts.passenger} goodsOnly=${prepared.categoryCounts.goodsOnly} privateSiding=${prepared.categoryCounts.privateSiding} withCoordinates=${prepared.categoryCounts.withCoordinates}`)

console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}\n`)
process.exit(failures === 0 ? 0 : 1)
