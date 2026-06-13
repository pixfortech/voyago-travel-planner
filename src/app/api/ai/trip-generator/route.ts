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
      { error: 'ai_generation_failed', stage: 'provider_init', message: 'The AI service is not configured. Please check server settings.' },
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
  // maxTokens must be high enough to cover adaptive thinking tokens + full JSON output.
  // A 5–7 day itinerary at 4–5 activities/day is ~6000–9000 output tokens. Adaptive
  // thinking for a generation-quality task may consume several thousand thinking tokens
  // on top of that, so 20000 gives safe headroom without hitting model limits.
  const isDev = process.env.NODE_ENV !== 'production'

  let completion: Awaited<ReturnType<typeof provider.complete>>
  try {
    completion = await provider.complete({
      tier: 'generation',
      system: TRIP_GENERATOR_SYSTEM_PROMPT,
      maxTokens: 20000,
      messages: [{ role: 'user', content: buildTripGeneratorUserMessage(input) }],
    })
  } catch (err) {
    // Log full error detail server-side for Cloud Run / local diagnosis.
    const errMsg = err instanceof Error ? err.message : String(err)
    const errStatus = (err as Record<string, unknown>)?.status as number | undefined
    const errCode = (err as Record<string, unknown>)?.code
    console.error('[Voyago AI] trip-generator: Claude API call failed', { message: errMsg, status: errStatus, code: errCode })

    // Classify the error for a helpful user-facing message.
    let userMessage = 'AI itinerary generation is currently unavailable. Please retry.'
    if (errStatus === 401) {
      userMessage = 'AI service authentication failed — check ANTHROPIC_API_KEY. Set AI_PROVIDER=mock in .env.local for local development.'
      console.error('[Voyago AI] HINT: Set AI_PROVIDER=mock in .env.local to use mock data locally without an API key.')
    } else if (errStatus === 429) {
      userMessage = 'AI service rate limit reached — please wait a moment and retry.'
    } else if (errStatus === 400) {
      userMessage = `AI service rejected the request (400): ${errMsg}. Check model name and parameters.`
    }

    // In development, fall back to mock data so local iteration is not blocked.
    // Production always returns 502 — silent mock in prod would be misleading.
    if (isDev) {
      console.warn('[Voyago AI] trip-generator: DEV MODE — falling back to mock data after API failure:', errMsg)
      const mockResult = mockTripGeneratorResult(input)
      const payload: TripGeneratorResponse & { _devWarning?: string } = {
        result: mockResult,
        isMock: true,
        provider: 'mock',
        model: AI_MODELS.generation,
        generationSource: 'dev_mock',
        _devWarning: `[DEV] Real AI call failed (HTTP ${errStatus ?? 'n/a'}): ${errMsg}. Showing mock data. Fix: set AI_PROVIDER=mock in .env.local to skip real calls.`,
      }
      return NextResponse.json(payload)
    }

    return NextResponse.json(
      { error: 'ai_generation_failed', stage: 'anthropic_call', message: userMessage },
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

    // Same dev fallback for parse failures (e.g. truncated JSON from a partial response).
    if (isDev) {
      console.warn('[Voyago AI] trip-generator: DEV MODE — falling back to mock data after parse failure')
      const mockResult = mockTripGeneratorResult(input)
      const payload: TripGeneratorResponse & { _devWarning?: string } = {
        result: mockResult,
        isMock: true,
        provider: 'mock',
        model: AI_MODELS.generation,
        generationSource: 'dev_mock',
        _devWarning: '[DEV] Response parse failed. Check server console for the raw response preview. Showing mock data.',
      }
      return NextResponse.json(payload)
    }

    return NextResponse.json(
      { error: 'ai_generation_failed', stage: 'parse', message: 'AI itinerary generation is currently unavailable. Please retry.' },
      { status: 502 },
    )
  }
}
