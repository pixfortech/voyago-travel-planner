/**
 * Restaurant / Café Intelligence — POST /api/ai/food-place-insight (Phase 14).
 *
 * Accepts privacy-safe place metadata + trip context and returns a structured
 * FoodPlaceInsight. Derived from metadata only — never scraped menus/reviews.
 * Falls back to a deterministic mock when ANTHROPIC_API_KEY is absent.
 */

import { NextResponse } from 'next/server'
import { resolveAiProvider } from '@/lib/ai/provider'
import { AI_MODELS } from '@/lib/ai/models'
import { rateLimit, clientKey } from '@/lib/server/rateLimit'
import {
  buildFoodInsightUserMessage,
  parseFoodInsightResult,
  mockFoodInsightResult,
  FOOD_INSIGHT_SYSTEM_PROMPT,
} from '@/lib/ai/foodPlaceInsight'
import type { FoodPlaceInsightInput, FoodPlaceInsightResponse } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function validateInput(body: unknown): FoodPlaceInsightInput | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (
    typeof b.placeName !== 'string' ||
    typeof b.tripName !== 'string' ||
    typeof b.destination !== 'string'
  ) {
    return null
  }
  return b as unknown as FoodPlaceInsightInput
}

export async function POST(request: Request) {
  const limit = rateLimit(`ai-food-insight:${clientKey(request)}`, 12, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterMs: limit.retryAfterMs },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const input = validateInput((body as Record<string, unknown>)?.input ?? body)
  if (!input) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  const provider = resolveAiProvider()

  if (provider.isMock) {
    const payload: FoodPlaceInsightResponse = {
      result: mockFoodInsightResult(input),
      isMock: true,
      provider: 'mock',
      model: AI_MODELS.chat,
    }
    return NextResponse.json(payload)
  }

  try {
    const completion = await provider.complete({
      tier: 'chat',
      system: FOOD_INSIGHT_SYSTEM_PROMPT,
      maxTokens: 1400,
      messages: [{ role: 'user', content: buildFoodInsightUserMessage(input) }],
    })
    const payload: FoodPlaceInsightResponse = {
      result: parseFoodInsightResult(completion.text, input),
      isMock: completion.isMock,
      provider: completion.provider,
      model: completion.model,
    }
    return NextResponse.json(payload)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Voyago AI] food-place-insight provider error:', err)
    }
    return NextResponse.json(
      { error: 'ai_unavailable', message: 'The AI provider could not be reached. Please try again.' },
      { status: 502 },
    )
  }
}
