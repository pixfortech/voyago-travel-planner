/**
 * AI Trip Generator — POST /api/ai/trip-generator (Phase 15C).
 *
 * Accepts a privacy-safe TripGeneratorInput and returns a structured
 * TripGeneratorResult preview. The caller MUST let the user confirm before any
 * Firestore mutation — this endpoint never writes trip data.
 *
 * Falls back to a deterministic, clearly-labelled mock when ANTHROPIC_API_KEY
 * is absent. Uses the 'generation' tier (highest quality) for real generation.
 */

import { NextResponse } from 'next/server'
import { resolveAiProvider } from '@/lib/ai/provider'
import { AI_MODELS } from '@/lib/ai/models'
import { rateLimit, clientKey } from '@/lib/server/rateLimit'
import {
  TRIP_GENERATOR_SYSTEM_PROMPT,
  buildTripGeneratorUserMessage,
  parseTripGeneratorResult,
  mockTripGeneratorResult,
} from '@/lib/ai/tripGenerator'
import type { TripGeneratorInput, TripGeneratorResponse, GeneratorMode } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_MODES: GeneratorMode[] = ['append', 'fill_empty', 'replace_future', 'replace_all_unprotected']

function validateInput(body: unknown): TripGeneratorInput | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (
    typeof b.destination !== 'string' || b.destination.trim().length < 2 ||
    typeof b.startDate !== 'string' ||
    typeof b.endDate !== 'string' ||
    typeof b.today !== 'string' ||
    typeof b.mode !== 'string' || !VALID_MODES.includes(b.mode as GeneratorMode) ||
    typeof b.composition !== 'object' || b.composition == null ||
    typeof b.preferences !== 'object' || b.preferences == null
  ) {
    return null
  }
  return b as unknown as TripGeneratorInput
}

export async function POST(request: Request) {
  // Generation is expensive — a tighter limit than chat endpoints.
  const limit = rateLimit(`ai-trip-generator:${clientKey(request)}`, 6, 60_000)
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
    const payload: TripGeneratorResponse = {
      result: mockTripGeneratorResult(input),
      isMock: true,
      provider: 'mock',
      model: AI_MODELS.generation,
    }
    return NextResponse.json(payload)
  }

  try {
    const completion = await provider.complete({
      tier: 'generation',
      system: TRIP_GENERATOR_SYSTEM_PROMPT,
      maxTokens: 4500,
      messages: [{ role: 'user', content: buildTripGeneratorUserMessage(input) }],
    })
    const payload: TripGeneratorResponse = {
      result: parseTripGeneratorResult(completion.text, input),
      isMock: completion.isMock,
      provider: completion.provider,
      model: completion.model,
    }
    return NextResponse.json(payload)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Voyago AI] trip-generator provider error:', err)
    }
    return NextResponse.json(
      { error: 'ai_unavailable', message: 'The AI provider could not be reached. Please try again.' },
      { status: 502 },
    )
  }
}
