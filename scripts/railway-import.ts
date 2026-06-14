/**
 * Manual station-master import (Phase 5).
 *
 * Parses a committed OFFICIAL station dump (CRIS RBS Station Details CSV, or an
 * OGD JSON export) into the normalised station master and writes the generated
 * snapshot used as the runtime fallback (and as the source for a later Firestore
 * upsert via /api/admin/railway-sync).
 *
 * Usage (compile + run; tsx/ts-node not required):
 *   npx tsc scripts/railway-import.ts \
 *     --outDir /tmp/rwy --module commonjs --target es2020 \
 *     --moduleResolution node --esModuleInterop --resolveJsonModule --skipLibCheck
 *   node /tmp/rwy/scripts/railway-import.js ./path/to/cris-rbs-station-details.csv
 *
 * Output:
 *   src/data/railway/generated/stations.generated.json  (normalised master)
 *   src/data/railway/generated/import-status.json        (counts + timings)
 *
 * Firestore upsert is handled by the deployed sync endpoint (which has Admin
 * creds), not this local script. NEVER fabricates records.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { prepareImport, IMPORTER_VERSION } from '../src/lib/railway/import/runImport'
import type { ImportStatus, StationSourceTag } from '../src/lib/railway/import/types'

function main(): void {
  const inputPath = process.argv[2] ?? process.env.RAILWAY_SOURCE_PATH
  if (!inputPath) {
    console.error('Usage: railway-import <path-to-dump.csv|.json>')
    process.exit(2)
  }
  if (!fs.existsSync(inputPath)) {
    console.error(`Source not found: ${inputPath}`)
    process.exit(2)
  }

  const content = fs.readFileSync(inputPath, 'utf8')
  const source: StationSourceTag = inputPath.endsWith('.json') ? 'OGD' : 'CRIS_RBS'
  const prepared = prepareImport(content, { source, sourceKey: path.basename(inputPath) })

  if (prepared.records.length === 0) {
    console.error(`Parsed 0 records (${prepared.parse.issues.length} issues). Refusing to write an empty master.`)
    if (prepared.parse.issues[0]) console.error(`First issue: ${prepared.parse.issues[0].reason}`)
    process.exit(1)
  }

  const outDir = path.resolve(__dirname, '../src/data/railway/generated')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'stations.generated.json'), JSON.stringify(prepared.records, null, 0) + '\n')

  const status: ImportStatus = {
    lastAttemptAt: new Date().toISOString(),
    lastSuccessfulImportAt: new Date().toISOString(),
    ok: true,
    source: prepared.parse.source,
    counts: { parsed: prepared.parse.records.length, added: prepared.records.length, updated: 0, unchanged: 0, removed: 0, deactivated: 0, skipped: prepared.parse.issues.length },
    categoryCounts: prepared.categoryCounts,
    error: null,
    issueCount: prepared.parse.issues.length,
    importerVersion: IMPORTER_VERSION,
  }
  fs.writeFileSync(path.join(outDir, 'import-status.json'), JSON.stringify(status, null, 2) + '\n')

  console.log('Station-master import complete:')
  console.log(`  source:        ${prepared.parse.source} (${path.basename(inputPath)})`)
  console.log(`  parsed:        ${prepared.parse.records.length}`)
  console.log(`  written:       ${prepared.records.length}`)
  console.log(`  active:        ${prepared.categoryCounts.active}`)
  console.log(`  passenger:     ${prepared.categoryCounts.passenger}`)
  console.log(`  goodsOnly:     ${prepared.categoryCounts.goodsOnly}`)
  console.log(`  privateSiding: ${prepared.categoryCounts.privateSiding}`)
  console.log(`  withCoords:    ${prepared.categoryCounts.withCoordinates}`)
  console.log(`  issues:        ${prepared.parse.issues.length}`)
}

main()
