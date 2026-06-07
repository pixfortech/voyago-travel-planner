/**
 * AI Budget Coach endpoint — POST /api/ai/budget-coach (Phase 5).
 *
 * Accepts a privacy-safe BudgetCoachInput (aggregate numbers + display names
 * only), validates its shape, rate-limits the caller, then either:
 *   • returns a deterministic, clearly-labelled MOCK result when no real provider
 *     is configured (so the feature works locally without ANTHROPIC_API_KEY), or
 *   • calls the real Anthropic provider and parses its structured JSON.
 *
 * The ANTHROPIC_API_KEY is read server-side via the provider resolver and is
 * NEVER returned to the client. Provider/parse errors degrade gracefully to a
 * derived result instead of failing the request.
 */

import { NextResponse } from 'next/server'
import { resolveAiProvider } from '@/lib/ai/provider'
import { AI_MODELS } from '@/lib/ai/models'
import { rateLimit, clientKey } from '@/lib/server/rateLimit'
import {
  validateBudgetCoachInput,
  buildCoachUserMessage,
  parseCoachResult,
  mockBudgetCoachResult,
  COACH_SYSTEM_PROMPT,
} from '@/lib/ai/budgetCoach'
import type { BudgetCoachResponse } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  // Rate limit: a low ceiling is plenty for a manual "Run analysis" button and
  // guards against accidental loops / abuse.
  const limit = rateLimit(`ai-budget-coach:${clientKey(request)}`, 12, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterMs: limit.retryAfterMs },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const input = validateBudgetCoachInput(
    (body as { input?: unknown } | null)?.input ?? body
  )
  if (!input) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  const provider = resolveAiProvider()

  // Mock path: structured advice derived from the real numbers, clearly flagged.
  if (provider.isMock) {
    const payload: BudgetCoachResponse = {
      result: mockBudgetCoachResult(input),
      isMock: true,
      provider: 'mock',
      model: AI_MODELS.chat,
    }
    return NextResponse.json(payload)
  }

  // Real provider path.
  try {
    const completion = await provider.complete({
      tier: 'chat',
      system: COACH_SYSTEM_PROMPT,
      maxTokens: 1600,
      messages: [{ role: 'user', content: buildCoachUserMessage(input) }],
    })

    const payload: BudgetCoachResponse = {
      result: parseCoachResult(completion.text, input),
      isMock: completion.isMock,
      provider: completion.provider,
      model: completion.model,
    }
    return NextResponse.json(payload)
  } catch (err) {
    // Never leak provider internals/keys; degrade to a derived result so the UI
    // still shows useful guidance with a clear error note.
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Voyago AI] budget-coach provider error:', err)
    }
    return NextResponse.json(
      { error: 'ai_unavailable', message: 'The AI provider could not be reached. Please try again.' },
      { status: 502 }
    )
  }
}
