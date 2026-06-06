/**
 * AI service health endpoint — Phase 0 foundation.
 *
 * A read-only smoke test for the server-side AI layer. It reports which
 * provider is active (real Anthropic vs development mock), whether Firebase
 * Admin is configured, the model tiers, and the current feature-flag snapshot.
 * It never performs generation and never exposes any secret value.
 */

import { NextResponse } from 'next/server'
import { aiProviderStatus } from '@/lib/ai/provider'
import { AI_MODELS } from '@/lib/ai/models'
import { isAdminConfigured } from '@/lib/firebaseAdmin'
import { rateLimit, clientKey } from '@/lib/server/rateLimit'
import { getFlagSnapshot } from '@/lib/flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limit = rateLimit(`ai-health:${clientKey(request)}`, 60, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { status: 'rate_limited', retryAfterMs: limit.retryAfterMs },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } },
    )
  }

  const ai = aiProviderStatus()

  return NextResponse.json({
    status: 'ok',
    service: 'voyago-ai',
    provider: ai.usingMock ? 'mock' : 'anthropic',
    aiKeyConfigured: ai.configured,
    usingMockProvider: ai.usingMock,
    providerOverride: ai.override,
    models: AI_MODELS,
    adminConfigured: isAdminConfigured(),
    flags: getFlagSnapshot(),
    timestamp: new Date().toISOString(),
  })
}
