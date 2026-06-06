/**
 * Claude model tiers for Voyago's AI features — Phase 0 foundation.
 *
 * Model IDs are complete as-is; do not append date suffixes.
 * Cost (per 1M tokens, input/output) is noted for capacity planning only.
 */

export const AI_MODELS = {
  /** Quality-critical generation: itinerary builder, optimizer. Opus 4.8 ($5/$25). */
  generation: 'claude-opus-4-8',
  /** Conversational + summaries: in-trip assistant, trip summary writer. Sonnet 4.6 ($3/$15). */
  chat: 'claude-sonnet-4-6',
  /** High-volume, low-latency: photo captions, short tips. Haiku 4.5 ($1/$5). */
  light: 'claude-haiku-4-5',
} as const

export type AiModelTier = keyof typeof AI_MODELS

/** Tiers that support adaptive thinking (Opus 4.x and Sonnet 4.6). */
export const ADAPTIVE_THINKING_TIERS: ReadonlySet<AiModelTier> = new Set<AiModelTier>([
  'generation',
  'chat',
])
