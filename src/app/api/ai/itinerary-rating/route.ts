/**
 * AI Itinerary Rating — POST /api/ai/itinerary-rating (Phase 13).
 *
 * Accepts an ItineraryRatingInput, validates it, then returns a structured
 * ItineraryRatingResult. Result is shown as a preview card — never mutates data.
 *
 * Falls back to a deterministic mock when ANTHROPIC_API_KEY is absent.
 */

import { NextResponse } from 'next/server'
import { resolveAiProvider } from '@/lib/ai/provider'
import { AI_MODELS } from '@/lib/ai/models'
import { rateLimit, clientKey } from '@/lib/server/rateLimit'
import {
  buildRatingUserMessage,
  parseRatingResult,
  mockRatingResult,
  RATING_SYSTEM_PROMPT,
} from '@/lib/ai/itineraryRating'
import type { ItineraryRatingInput, ItineraryRatingResponse } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function validateInput(body: unknown): ItineraryRatingInput | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (
    typeof b.tripName !== 'string' ||
    typeof b.destination !== 'string' ||
    typeof b.startDate !== 'string' ||
    !Array.isArray(b.days)
  ) {
    return null
  }
  return b as unknown as ItineraryRatingInput
}

export async function POST(request: Request) {
  const limit = rateLimit(`ai-itinerary-rating:${clientKey(request)}`, 8, 60_000)
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
    const payload: ItineraryRatingResponse = {
      result: mockRatingResult(input),
      isMock: true,
      provider: 'mock',
      model: AI_MODELS.chat,
    }
    return NextResponse.json(payload)
  }

  try {
    const completion = await provider.complete({
      tier: 'chat',
      system: RATING_SYSTEM_PROMPT,
      maxTokens: 2000,
      messages: [{ role: 'user', content: buildRatingUserMessage(input) }],
    })
    const payload: ItineraryRatingResponse = {
      result: parseRatingResult(completion.text, input),
      isMock: completion.isMock,
      provider: completion.provider,
      model: completion.model,
    }
    return NextResponse.json(payload)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Voyago AI] itinerary-rating provider error:', err)
    }
    return NextResponse.json(
      { error: 'ai_unavailable', message: 'The AI provider could not be reached. Please try again.' },
      { status: 502 },
    )
  }
}
