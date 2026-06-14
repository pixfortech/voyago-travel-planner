/**
 * Railway data-layer smoke test.
 *
 * Verifies the station master + search + nearest-station + train route lookup
 * without booting Next.js. Self-contained (relative imports only) so it can be
 * compiled + run standalone:
 *
 *   npx tsc scripts/railway-smoke-test.ts \
 *     --outDir /tmp/railway-smoke --module commonjs --target es2020 \
 *     --moduleResolution node --esModuleInterop
 *   node /tmp/railway-smoke/scripts/railway-smoke-test.js
 *
 * Exits non-zero if any required case fails.
 */

import { searchRailwayStations, formatStationLabel } from '../src/lib/railway/stationSearch'
import { nearestStationSplit, nearestStations } from '../src/lib/railway/nearestStations'
import { RAILWAY_STATIONS } from '../src/data/railway/stations'
import { INDIA_TRAINS, trainServesRoute } from '../src/data/indiaTrains'

let failures = 0
function check(label: string, cond: boolean, detail = ''): void {
  const tag = cond ? 'PASS' : 'FAIL'
  if (!cond) failures++
  // eslint-disable-next-line no-console
  console.log(`[${tag}] ${label}${detail ? ` — ${detail}` : ''}`)
}

/** Assert the top result for `query` has the expected code. */
function expectTop(query: string, expectedCode: string): void {
  const results = searchRailwayStations(query, 8)
  const top = results[0]
  const ok = !!top && top.code === expectedCode
  check(
    `search "${query}" → ${expectedCode}`,
    ok,
    top ? `got ${top.code} (${formatStationLabel(top)})` : 'no results',
  )
}

/** Assert `expectedCode` appears anywhere in the result list for `query`. */
function expectContains(query: string, expectedCode: string): void {
  const results = searchRailwayStations(query, 8)
  const ok = results.some((r) => r.code === expectedCode)
  check(`search "${query}" contains ${expectedCode}`, ok, results.map((r) => r.code).join(', '))
}

console.log('\n── Required Goa station search cases ──')
expectTop('Vasco', 'VSG')
expectTop('VSG', 'VSG')
expectTop('Vasco Da Gama', 'VSG')
expectTop('Madgaon', 'MAO')
expectTop('Margao', 'MAO')
expectTop('MAO', 'MAO')
expectTop('Karmali', 'KRMI')
expectTop('KRMI', 'KRMI')
expectTop('Thivim', 'THVM')
expectTop('THVM', 'THVM')
expectTop('Pernem', 'PERN')
expectTop('Canacona', 'CNO')
expectTop('Kulem', 'QLM')

console.log('\n── Spelling / alias variations ──')
expectTop('Tivim', 'THVM')
expectTop('Collem', 'QLM')
expectContains('Chaudi', 'CNO')
expectTop('Margaon', 'MAO')

console.log('\n── Fuzzy / typo tolerance ──')
expectContains('Madgao', 'MAO')
expectContains('Vasko', 'VSG')

console.log('\n── No undefined leaks in dataset ──')
check(
  'every station has code+name+city+state',
  RAILWAY_STATIONS.every((s) => !!s.code && !!s.name && !!s.city && !!s.state),
)
check(
  'all station codes unique',
  new Set(RAILWAY_STATIONS.map((s) => s.code)).size === RAILWAY_STATIONS.length,
  `${RAILWAY_STATIONS.length} stations`,
)

console.log('\n── Nearest-station for Goa (Baga / North Goa ~15.555,73.751) ──')
const goa = nearestStationSplit(15.5553, 73.7517, { maxDistanceKm: 120 })
check('nearest station found near North Goa', !!goa.nearest, goa.nearest ? `${goa.nearest.station.code} @ ${goa.nearest.distanceKm}km` : 'none')
check('nearest MAJOR station found (boarding option)', !!goa.nearestMajor, goa.nearestMajor ? `${goa.nearestMajor.station.code} @ ${goa.nearestMajor.distanceKm}km` : 'none')
const goaCodes = nearestStations(15.4909, 73.8278, { maxDistanceKm: 120, limit: 10 }).map((n) => n.station.code)
check('Panaji nearby set includes Goa Konkan stations', ['MAO', 'VSG', 'KRMI', 'THVM'].some((c) => goaCodes.includes(c)), goaCodes.join(', '))

console.log('\n── Train route lookup (Mumbai → Goa) ──')
const mandovi = INDIA_TRAINS.find((t) => t.trainNumber === '10103')
check('Mandovi Express (10103) present', !!mandovi)
check('10103 serves CSMT → MAO direction', !!mandovi && trainServesRoute(mandovi, 'CSMT', 'MAO') === 'match')
check('10103 reverse (MAO → CSMT) flagged reverse', !!mandovi && trainServesRoute(mandovi, 'MAO', 'CSMT') === 'reverse')

console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}\n`)
process.exit(failures === 0 ? 0 : 1)
