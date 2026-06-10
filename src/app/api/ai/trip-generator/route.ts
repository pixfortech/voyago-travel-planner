/**
 * AI Trip Generator — POST /api/ai/trip-generator (Phase 15C / updated 16A).
 *
 * Accepts a privacy-safe TripGeneratorInput and returns a structured
 * TripGeneratorResult preview. The caller MUST let the user confirm before any
 * Firestore mutation — this endpoint never writes trip data.
 *
 * generationSource in the response: 'anthropic' | 'dev_mock' | 'unavailable'
 *
 * Dev mock is ONLY returned when AI_PROVIDER=mock is explicitly set.
 * In all other error cases (no key, parse failure, API error) the route
 * returns a 502 with a clear error message — it never silently falls back
 * to mock data in production.
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

  let provider
  try {
    provider = resolveAiProvider()
  } catch (err) {
    // resolveAiProvider throws when AI_PROVIDER=anthropic but no key is set.
    // This is always logged (not gated on NODE_ENV) so Cloud Run surfaces it.
    console.error('[Voyago AI] trip-generator: provider init failed:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'ai_unavailable', message: 'The AI service is not configured. Please check server settings.' },
      { status: 502 },
    )
  }

  if (provider.isMock) {
    // Only reached when AI_PROVIDER=mock is explicitly set (local dev opt-in).
    // resolveAiProvider() throws in production if no key is configured, so this
    // path is unreachable in production.
    const payload: TripGeneratorResponse = {
      result: mockTripGeneratorResult(input),
      isMock: true,
      provider: 'mock',
      model: AI_MODELS.generation,
      generationSource: 'dev_mock',
    }
    return NextResponse.json(payload)
  }

  // ── Real Anthropic path ───────────────────────────────────────────────────

  // Step 1: call the model. Separated from parse so failures are logged distinctly.
  // maxTokens is set high enough to prevent JSON truncation even with adaptive thinking.
  // Opus 4.8 with adaptive thinking uses some tokens for reasoning; 8000 leaves
  // plenty for a 5–7 day itinerary at 4–5 activities/day.
  let completion: Awaited<ReturnType<typeof provider.complete>>
  try {
    completion = await provider.complete({
      tier: 'generation',
      system: TRIP_GENERATOR_SYSTEM_PROMPT,
      maxTokens: 8000,
      messages: [{ role: 'user', content: buildTripGeneratorUserMessage(input) }],
    })
  } catch (err) {
    console.error('[Voyago AI] trip-generator: Claude API call failed:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'ai_unavailable', generationSource: 'unavailable', message: 'AI itinerary generation is currently unavailable. Please retry.' },
      { status: 502 },
    )
  }

  // Step 2: parse the structured JSON from Claude's response.
  // parseTripGeneratorResult now throws instead of silently falling back to mock,
  // so a parse failure surfaces as an error rather than injecting mock content.
  try {
    const result = parseTripGeneratorResult(completion.text, input)
    const payload: TripGeneratorResponse = {
      result,
      isMock: completion.isMock,
      provider: completion.provider,
      model: completion.model,
      generationSource: 'anthropic',
    }
    return NextResponse.json(payload)
  } catch (err) {
    // parseTripGeneratorResult already logged the response preview — just record
    // the route-level failure here for correlation in Cloud Run logs.
    console.error('[Voyago AI] trip-generator: response parse failed:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'ai_parse_failed', generationSource: 'unavailable', message: 'AI itinerary generation is currently unavailable. Please retry.' },
      { status: 502 },
    )
  }
}
