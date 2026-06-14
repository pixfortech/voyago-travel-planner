/**
 * AI usage cost calculator + logger.
 *
 * Single source of truth for Anthropic pricing — update the table here when
 * pricing changes. Computes per-generation USD (and optional INR) cost from the
 * model's reported token usage, including prompt-caching pricing when those
 * usage fields are present.
 *
 * Pricing is per 1M tokens (MTok). Prompt caching: cache WRITE is billed at
 * 1.25× the base input rate (5-minute TTL), cache READ at 0.1× the base input
 * rate — Anthropic's standard multipliers.
 */

import type { AiUsage, AiProviderName } from './types'

export interface ModelPricing {
  /** USD per 1M input tokens. */
  inputPerMTok: number
  /** USD per 1M output tokens. */
  outputPerMTok: number
}

/** Pricing table (USD / MTok). Keep in sync with Anthropic's published pricing. */
export const AI_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-6': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-opus-4-8': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },
}

/** Multiplier on the base input rate for tokens WRITTEN to the prompt cache. */
export const CACHE_WRITE_MULTIPLIER = 1.25
/** Multiplier on the base input rate for tokens READ from the prompt cache. */
export const CACHE_READ_MULTIPLIER = 0.1

/**
 * Resolve pricing for a model id. Tries an exact match first, then a substring
 * match on the family (sonnet/opus/haiku) so minor id variants still price.
 * Returns `undefined` when unknown (caller treats cost as not-estimable).
 */
export function getModelPricing(model: string): ModelPricing | undefined {
  if (AI_PRICING[model]) return AI_PRICING[model]
  const m = model.toLowerCase()
  if (m.includes('opus')) return AI_PRICING['claude-opus-4-8']
  if (m.includes('sonnet')) return AI_PRICING['claude-sonnet-4-6']
  if (m.includes('haiku')) return AI_PRICING['claude-haiku-4-5']
  return undefined
}

/** USD→INR rate from env (AI_USD_INR_RATE preferred, USD_INR_RATE accepted). */
export function getUsdInrRate(): number | undefined {
  const raw = process.env.AI_USD_INR_RATE ?? process.env.USD_INR_RATE
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export interface CostBreakdown {
  model: string
  /** False when the model id wasn't in the pricing table (cost is 0/uncertain). */
  pricingKnown: boolean
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  totalTokens: number
  inputUsd: number
  outputUsd: number
  cacheWriteUsd: number
  cacheReadUsd: number
  totalUsd: number
  /** Present only when an env exchange rate is configured. */
  totalInr?: number
  inrRate?: number
}

function round(n: number, dp = 6): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

/**
 * Estimate the cost of one completion from its token usage. A mock/usage-less
 * completion yields an all-zero breakdown (cost $0.00).
 */
export function estimateCost(model: string, usage?: AiUsage): CostBreakdown {
  const inputTokens = usage?.inputTokens ?? 0
  const outputTokens = usage?.outputTokens ?? 0
  const cacheCreationInputTokens = usage?.cacheCreationInputTokens ?? 0
  const cacheReadInputTokens = usage?.cacheReadInputTokens ?? 0
  const totalTokens = inputTokens + outputTokens + cacheCreationInputTokens + cacheReadInputTokens

  const pricing = getModelPricing(model)
  const inRate = (pricing?.inputPerMTok ?? 0) / 1_000_000
  const outRate = (pricing?.outputPerMTok ?? 0) / 1_000_000

  const inputUsd = inputTokens * inRate
  const outputUsd = outputTokens * outRate
  const cacheWriteUsd = cacheCreationInputTokens * inRate * CACHE_WRITE_MULTIPLIER
  const cacheReadUsd = cacheReadInputTokens * inRate * CACHE_READ_MULTIPLIER
  const totalUsd = inputUsd + outputUsd + cacheWriteUsd + cacheReadUsd

  const inrRate = getUsdInrRate()
  const breakdown: CostBreakdown = {
    model,
    pricingKnown: Boolean(pricing),
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    totalTokens,
    inputUsd: round(inputUsd),
    outputUsd: round(outputUsd),
    cacheWriteUsd: round(cacheWriteUsd),
    cacheReadUsd: round(cacheReadUsd),
    totalUsd: round(totalUsd),
  }
  if (inrRate) {
    breakdown.inrRate = inrRate
    breakdown.totalInr = round(totalUsd * inrRate, 2)
  }
  return breakdown
}

/** Compact, safe usage metadata for the API response / analytics (no prompt text). */
export interface AiUsageMeta {
  provider: AiProviderName
  model: string
  isMock: boolean
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  totalTokens: number
  estimatedCostUsd: number
  estimatedCostInr?: number
}

export function toUsageMeta(
  breakdown: CostBreakdown,
  provider: AiProviderName,
  isMock: boolean,
): AiUsageMeta {
  const meta: AiUsageMeta = {
    provider,
    model: breakdown.model,
    isMock,
    inputTokens: breakdown.inputTokens,
    outputTokens: breakdown.outputTokens,
    totalTokens: breakdown.totalTokens,
    estimatedCostUsd: breakdown.totalUsd,
  }
  if (breakdown.cacheCreationInputTokens > 0) meta.cacheCreationInputTokens = breakdown.cacheCreationInputTokens
  if (breakdown.cacheReadInputTokens > 0) meta.cacheReadInputTokens = breakdown.cacheReadInputTokens
  if (breakdown.totalInr != null) meta.estimatedCostInr = breakdown.totalInr
  return meta
}

/** Format the dev console one-liner, e.g.
 *  `[AI COST] model=claude-sonnet-4-6 input=18320 output=4820 estimated=$0.127` */
export function formatCostLine(breakdown: CostBreakdown, opts: { isMock: boolean }): string {
  if (opts.isMock) {
    return `[AI COST] provider=mock model=${breakdown.model} input=0 output=0 estimated=$0.00 (mock — no real AI cost)`
  }
  const parts = [
    `[AI COST] model=${breakdown.model}`,
    `input=${breakdown.inputTokens}`,
    `output=${breakdown.outputTokens}`,
  ]
  if (breakdown.cacheCreationInputTokens > 0) parts.push(`cacheWrite=${breakdown.cacheCreationInputTokens}`)
  if (breakdown.cacheReadInputTokens > 0) parts.push(`cacheRead=${breakdown.cacheReadInputTokens}`)
  parts.push(`total=${breakdown.totalTokens}`)
  parts.push(`estimated=$${breakdown.totalUsd.toFixed(3)}`)
  if (breakdown.totalInr != null) parts.push(`(₹${breakdown.totalInr.toFixed(2)} @${breakdown.inrRate})`)
  if (!breakdown.pricingKnown) parts.push('(pricing unknown for model)')
  return parts.join(' ')
}

/**
 * Compute the cost, log a dev console summary, and return safe usage metadata.
 * Logs when NODE_ENV !== 'production' OR AI_DEBUG_COST=true. Never throws.
 */
export function logAiUsage(args: {
  model: string
  usage?: AiUsage
  provider: AiProviderName
  isMock: boolean
  /** Optional non-sensitive context label (e.g. "trip-generator"). */
  context?: string
}): AiUsageMeta {
  const breakdown = estimateCost(args.model, args.usage)
  const shouldLog = process.env.NODE_ENV !== 'production' || process.env.AI_DEBUG_COST === 'true'
  if (shouldLog) {
    const prefix = args.context ? `${formatCostLine(breakdown, { isMock: args.isMock })} ctx=${args.context}` : formatCostLine(breakdown, { isMock: args.isMock })
    // eslint-disable-next-line no-console
    console.log(prefix)
  }
  return toUsageMeta(breakdown, args.provider, args.isMock)
}
