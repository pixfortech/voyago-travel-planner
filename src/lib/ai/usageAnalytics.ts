/**
 * Optional AI usage analytics (Task 7) — server-only, best-effort.
 *
 * Persists SAFE usage/cost metadata to an admin-only Firestore collection so AI
 * spend can be analysed over time. It NEVER stores prompt text, user content, or
 * API keys — only model, token counts, estimated cost, and coarse non-sensitive
 * context (feature name, day count, mode).
 *
 * Gated by env `AI_USAGE_ANALYTICS=true` AND Firebase Admin being configured.
 * Fully fire-and-forget: any failure is swallowed so it can never affect a
 * generation response.
 */

import 'server-only'
import type { AiUsageMeta } from './cost'

const COLLECTION = 'aiUsageEvents'

export interface AiUsageContext {
  /** Feature label, e.g. "trip-generator". */
  feature: string
  /** Coarse, non-sensitive request shape (no destination names / prompt text). */
  dayCount?: number
  mode?: string
}

/** Whether analytics persistence is enabled. */
export function usageAnalyticsEnabled(): boolean {
  return process.env.AI_USAGE_ANALYTICS === 'true'
}

/**
 * Record one usage event. Resolves immediately; the write happens in the
 * background and never throws into the caller.
 */
export function recordAiUsage(meta: AiUsageMeta, ctx: AiUsageContext): void {
  if (!usageAnalyticsEnabled()) return
  void (async () => {
    try {
      const { isAdminConfigured, getAdminFirestore } = await import('@/lib/firebaseAdmin')
      if (!isAdminConfigured()) return
      const db = getAdminFirestore()
      await db.collection(COLLECTION).add({
        feature: ctx.feature,
        dayCount: ctx.dayCount ?? null,
        mode: ctx.mode ?? null,
        provider: meta.provider,
        model: meta.model,
        isMock: meta.isMock,
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
        cacheCreationInputTokens: meta.cacheCreationInputTokens ?? null,
        cacheReadInputTokens: meta.cacheReadInputTokens ?? null,
        totalTokens: meta.totalTokens,
        estimatedCostUsd: meta.estimatedCostUsd,
        estimatedCostInr: meta.estimatedCostInr ?? null,
        createdAt: new Date().toISOString(),
      })
    } catch (err) {
      // Best-effort only — log once, never propagate.
      console.warn('[Voyago AI] usage analytics write skipped:', err instanceof Error ? err.message : err)
    }
  })()
}
