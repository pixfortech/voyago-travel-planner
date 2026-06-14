# Generated station master snapshot

`stations.generated.json` is **machine-generated** by the station-master import
pipeline — do not edit it by hand.

- It starts as `[]`. The curated 182-station seed is the runtime fallback until
  this file (or Firestore) is populated.
- Populate it by running the importer against a committed official dump:

  ```bash
  # writes the normalised master here (and to Firestore if admin creds are set)
  npx tsx scripts/railway-import.ts ./path/to/cris-rbs-station-details.csv
  ```

- Provenance tiers used at runtime (highest first): Firestore → this file →
  curated seed. See `src/lib/railway/store/stationMasterProvider.ts`.

The official source dump itself (CRIS RBS Station Details export / OGD JSON) is
**not committed here** — drop it in and point the importer at it.
