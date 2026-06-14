/**
 * Claude model tiers for Voyago's AI features.
 *
 * Model IDs are complete as-is; do not append date suffixes.
 *
 * Model selection is env-configurable so the default can be tuned without code
 * changes (see `cost.ts` for the matching pricing table):
 *   - ANTHROPIC_MODEL          default generation model   (default: Sonnet 4.6)
 *   - ANTHROPIC_PREMIUM_MODEL  premium / deep-planning model (default: Opus 4.8)
 *   - ANTHROPIC_USE_PREMIUM    "true" → generation uses the premium model
 *
 * Sonnet 4.6 is the DEFAULT for normal trip generation (cheaper). Opus 4.8 is
 * opt-in for premium/deep planning or retries — never the silent default.
 */

/** Default generation model — cheaper, used for normal trip generation. */
export const DEFAULT_GENERATION_MODEL = 'claude-sonnet-4-6'
/** Premium generation model — opt-in for deep planning / retries (pricier). */
export const DEFAULT_PREMIUM_MODEL = 'claude-opus-4-8'

function envModel(name: string, fallback: string): string {
  const v = process.env[name]?.trim()
  return v && v.length > 0 ? v : fallback
}

export const AI_MODELS = {
  /** Itinerary builder / optimizer. Default Sonnet 4.6 ($3/$15); override via ANTHROPIC_MODEL. */
  generation: envModel('ANTHROPIC_MODEL', DEFAULT_GENERATION_MODEL),
  /** Conversational + summaries: in-trip assistant, summary writer. Sonnet 4.6 ($3/$15). */
  chat: 'claude-sonnet-4-6',
  /** High-volume, low-latency: photo captions, short tips. Haiku 4.5 ($1/$5). */
  light: 'claude-haiku-4-5',
}

/** Premium generation model id (Opus 4.8 by default), used when premium is requested. */
export const PREMIUM_GENERATION_MODEL = envModel('ANTHROPIC_PREMIUM_MODEL', DEFAULT_PREMIUM_MODEL)

export type AiModelTier = keyof typeof AI_MODELS

/** Tiers that support adaptive thinking (Opus 4.x and Sonnet 4.6). */
export const ADAPTIVE_THINKING_TIERS: ReadonlySet<AiModelTier> = new Set<AiModelTier>([
  'generation',
  'chat',
])

/**
 * Resolve the concrete model id for a tier. For the `generation` tier, `premium`
 * (or the ANTHROPIC_USE_PREMIUM env toggle) selects the premium model.
 */
export function resolveModel(tier: AiModelTier, premium?: boolean): string {
  const wantPremium = premium ?? process.env.ANTHROPIC_USE_PREMIUM === 'true'
  if (tier === 'generation' && wantPremium) return PREMIUM_GENERATION_MODEL
  return AI_MODELS[tier]
}
