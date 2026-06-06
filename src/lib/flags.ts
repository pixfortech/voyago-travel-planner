/**
 * Feature flag system — Phase 0 foundation.
 *
 * Every major capability in the Voyago roadmap is gated behind a flag so that
 * unfinished or experimental work can ship safely (disabled) and be turned on
 * per-environment without code changes. A feature must either work fully or be
 * hidden behind a flag that defaults to `false`.
 *
 * Flags are read from `NEXT_PUBLIC_FLAG_*` environment variables so the same
 * value is available on both server and client. Anything unset falls back to
 * the default below (all off in Phase 0 — no user-facing features built yet).
 */

export type FeatureFlag =
  | 'premiumDesign' // Phase 1: dark mode, skeletons, premium landing/dashboard
  | 'authAccounts' // Phase 2: email + Google accounts
  | 'itineraryPro' // Phase 3: drag-reorder, time blocks, conflict detection
  | 'aiFeatures' // Phase 4-5: AI generation, assistant, recommendations
  | 'budgetPro' // Phase 6: split, settlement, charts, export
  | 'photos' // Phase 7: photo gallery + memories
  | 'photoEditing' // Phase 8: non-destructive photo editing
  | 'collaboration' // Phase 9: invites, comments, voting, tasks
  | 'sharingLinks' // Phase 10: public/private share links, exports
  | 'mapFeatures' // Phase 11 (experimental): map-aware travel time/grouping
  | 'faceGrouping' // Phase 11 (experimental): privacy-safe face grouping

/** Experimental flags ship as "Coming soon" until fully built and reviewed. */
export const EXPERIMENTAL_FLAGS: ReadonlySet<FeatureFlag> = new Set<FeatureFlag>([
  'mapFeatures',
  'faceGrouping',
])

const DEFAULTS: Record<FeatureFlag, boolean> = {
  premiumDesign: false,
  authAccounts: false,
  itineraryPro: false,
  aiFeatures: false,
  budgetPro: false,
  photos: false,
  photoEditing: false,
  collaboration: false,
  sharingLinks: false,
  mapFeatures: false,
  faceGrouping: false,
}

const ENV_KEYS: Record<FeatureFlag, string> = {
  premiumDesign: 'NEXT_PUBLIC_FLAG_PREMIUM_DESIGN',
  authAccounts: 'NEXT_PUBLIC_FLAG_AUTH_ACCOUNTS',
  itineraryPro: 'NEXT_PUBLIC_FLAG_ITINERARY_PRO',
  aiFeatures: 'NEXT_PUBLIC_FLAG_AI_FEATURES',
  budgetPro: 'NEXT_PUBLIC_FLAG_BUDGET_PRO',
  photos: 'NEXT_PUBLIC_FLAG_PHOTOS',
  photoEditing: 'NEXT_PUBLIC_FLAG_PHOTO_EDITING',
  collaboration: 'NEXT_PUBLIC_FLAG_COLLABORATION',
  sharingLinks: 'NEXT_PUBLIC_FLAG_SHARING_LINKS',
  mapFeatures: 'NEXT_PUBLIC_FLAG_MAP_FEATURES',
  faceGrouping: 'NEXT_PUBLIC_FLAG_FACE_GROUPING',
}

/**
 * `NEXT_PUBLIC_*` vars are inlined at build time, so we read them via an
 * explicit static map rather than dynamic `process.env[key]` access.
 */
const ENV_VALUES: Record<FeatureFlag, string | undefined> = {
  premiumDesign: process.env.NEXT_PUBLIC_FLAG_PREMIUM_DESIGN,
  authAccounts: process.env.NEXT_PUBLIC_FLAG_AUTH_ACCOUNTS,
  itineraryPro: process.env.NEXT_PUBLIC_FLAG_ITINERARY_PRO,
  aiFeatures: process.env.NEXT_PUBLIC_FLAG_AI_FEATURES,
  budgetPro: process.env.NEXT_PUBLIC_FLAG_BUDGET_PRO,
  photos: process.env.NEXT_PUBLIC_FLAG_PHOTOS,
  photoEditing: process.env.NEXT_PUBLIC_FLAG_PHOTO_EDITING,
  collaboration: process.env.NEXT_PUBLIC_FLAG_COLLABORATION,
  sharingLinks: process.env.NEXT_PUBLIC_FLAG_SHARING_LINKS,
  mapFeatures: process.env.NEXT_PUBLIC_FLAG_MAP_FEATURES,
  faceGrouping: process.env.NEXT_PUBLIC_FLAG_FACE_GROUPING,
}

function parseFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw === '') return fallback
  return raw === '1' || raw.toLowerCase() === 'true'
}

/** Returns whether a feature flag is enabled in the current environment. */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return parseFlag(ENV_VALUES[flag], DEFAULTS[flag])
}

/** Returns the environment variable name that controls a flag (for docs/tooling). */
export function flagEnvKey(flag: FeatureFlag): string {
  return ENV_KEYS[flag]
}

/** Snapshot of every flag's current state — used by the AI health endpoint and future UI. */
export function getFlagSnapshot(): Record<FeatureFlag, boolean> {
  const out = {} as Record<FeatureFlag, boolean>
  for (const flag of Object.keys(DEFAULTS) as FeatureFlag[]) {
    out[flag] = isFeatureEnabled(flag)
  }
  return out
}
