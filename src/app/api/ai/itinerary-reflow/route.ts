/**
 * AI Itinerary Reflow — POST /api/ai/itinerary-reflow (Phase 13).
 *
 * Accepts an ItineraryReflowInput, validates it, then returns a structured
 * ItineraryReflowResult preview. The caller MUST confirm before applying any
 * Firestore mutations — this endpoint never writes trip data.
 *
 * Falls back to a deterministic mock when ANTHROPIC_API_KEY is absent.
 */

import { NextResponse } from 'next/server'
import { resolveAiProvider } from '@/lib/ai/provider'
import { AI_MODELS } from '@/lib/ai/models'
import { rateLimit, clientKey } from '@/lib/server/rateLimit'
import {
  buildReflowUserMessage,
  parseReflowResult,
  mockReflowResult,
  REFLOW_SYSTEM_PROMPT,
} from '@/lib/ai/itineraryReflow'
import type { ItineraryReflowInput, ItineraryReflowResponse } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function validateInput(body: unknown): ItineraryReflowInput | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (
    typeof b.tripName !== 'string' ||
    typeof b.newStartDate !== 'string' ||
    typeof b.newEndDate !== 'string' ||
    typeof b.today !== 'string' ||
    !Array.isArray(b.outOfRangeDays) ||
    !Array.isArray(b.validDates)
  ) {
    return null
  }
  return b as unknown as ItineraryReflowInput
}

export async function POST(request: Request) {
  const limit = rateLimit(`ai-itinerary-reflow:${clientKey(request)}`, 8, 60_000)
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
    const payload: ItineraryReflowResponse = {
      result: mockReflowResult(input),
      isMock: true,
      provider: 'mock',
      model: AI_MODELS.chat,
    }
    return NextResponse.json(payload)
  }

  try {
    const completion = await provider.complete({
      tier: 'chat',
      system: REFLOW_SYSTEM_PROMPT,
      maxTokens: 2000,
      messages: [{ role: 'user', content: buildReflowUserMessage(input) }],
    })
    const payload: ItineraryReflowResponse = {
      result: parseReflowResult(completion.text, input),
      isMock: completion.isMock,
      provider: completion.provider,
      model: completion.model,
    }
    return NextResponse.json(payload)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Voyago AI] itinerary-reflow provider error:', err)
    }
    return NextResponse.json(
      { error: 'ai_unavailable', message: 'The AI provider could not be reached. Please try again.' },
      { status: 502 },
    )
  }
}
