/**
 * AI Itinerary Gap Planner — POST /api/ai/itinerary-gap-planner (Phase 15A).
 *
 * Accepts a GapPlannerInput, validates it, then returns a structured
 * GapPlannerResult PREVIEW. The caller MUST confirm before applying any
 * Firestore mutations — this endpoint never writes trip data and never receives
 * full GPS history (only the optional current location the user explicitly ran with).
 *
 * Falls back to a deterministic, clearly-labelled mock when ANTHROPIC_API_KEY
 * is absent.
 */

import { NextResponse } from 'next/server'
import { resolveAiProvider } from '@/lib/ai/provider'
import { AI_MODELS } from '@/lib/ai/models'
import { rateLimit, clientKey } from '@/lib/server/rateLimit'
import {
  buildGapPlannerUserMessage,
  parseGapPlannerResult,
  mockGapPlannerResult,
  GAP_PLANNER_SYSTEM_PROMPT,
} from '@/lib/ai/itineraryGapPlanner'
import type { GapPlannerInput, GapPlannerResponse, GapPlannerMode } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_MODES = new Set<GapPlannerMode>([
  'complete_remaining',
  'today_only',
  'tomorrow_only',
  'next_few_hours',
  'fill_free_time',
  'replace_missed',
])

function validateInput(body: unknown): GapPlannerInput | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (
    typeof b.tripName !== 'string' ||
    typeof b.destination !== 'string' ||
    typeof b.startDate !== 'string' ||
    typeof b.endDate !== 'string' ||
    typeof b.today !== 'string' ||
    typeof b.mode !== 'string' ||
    !VALID_MODES.has(b.mode as GapPlannerMode) ||
    !Array.isArray(b.visitedPlaces) ||
    !Array.isArray(b.remainingPlaces)
  ) {
    return null
  }
  return b as unknown as GapPlannerInput
}

export async function POST(request: Request) {
  const limit = rateLimit(`ai-itinerary-gap:${clientKey(request)}`, 8, 60_000)
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
    const payload: GapPlannerResponse = {
      result: mockGapPlannerResult(input),
      isMock: true,
      provider: 'mock',
      model: AI_MODELS.generation,
    }
    return NextResponse.json(payload)
  }

  try {
    const completion = await provider.complete({
      tier: 'generation',
      system: GAP_PLANNER_SYSTEM_PROMPT,
      maxTokens: 2400,
      messages: [{ role: 'user', content: buildGapPlannerUserMessage(input) }],
    })
    const payload: GapPlannerResponse = {
      result: parseGapPlannerResult(completion.text, input),
      isMock: completion.isMock,
      provider: completion.provider,
      model: completion.model,
    }
    return NextResponse.json(payload)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Voyago AI] itinerary-gap-planner provider error:', err)
    }
    return NextResponse.json(
      { error: 'ai_unavailable', message: 'The AI provider could not be reached. Please try again.' },
      { status: 502 },
    )
  }
}
