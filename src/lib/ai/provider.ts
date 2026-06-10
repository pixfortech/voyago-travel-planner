/**
 * AI provider resolver — Phase 0 foundation.
 *
 * Selects the active provider based on environment:
 *   - AI_PROVIDER=mock         → always mock (dev)
 *   - AI_PROVIDER=anthropic    → require ANTHROPIC_API_KEY, else throw
 *   - (unset / auto)           → Anthropic when a key is present, otherwise the
 *                                dev mock so the app never breaks
 *
 * Server-only: this module reads server secrets and must never be imported into
 * client components.
 */

import 'server-only'
import { createMockProvider } from './mockProvider'
import { createAnthropicProvider } from './anthropicProvider'
import type { AiProvider } from './types'

export function resolveAiProvider(): AiProvider {
  const override = process.env.AI_PROVIDER
  const apiKey = process.env.ANTHROPIC_API_KEY
  const isProd = process.env.NODE_ENV === 'production'

  // Explicit mock opt-in: AI_PROVIDER=mock or local dev with no key.
  if (override === 'mock') return createMockProvider()

  // Explicit Anthropic: must have the key.
  if (override === 'anthropic') {
    if (!apiKey) {
      console.error(
        '[Voyago AI] ANTHROPIC_API_KEY is not set but AI_PROVIDER=anthropic. ' +
        'Ensure the "anthropicApiKey" secret is created in Secret Manager and the ' +
        'Cloud Run service account has roles/secretmanager.secretAccessor.',
      )
      throw new Error('AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set')
    }
    return createAnthropicProvider(apiKey)
  }

  // Auto mode (no AI_PROVIDER set):
  //  - With a key → real Anthropic.
  //  - Without a key in production → error (prevents silent mock data in prod).
  //  - Without a key in dev → mock (convenient local fallback).
  if (apiKey) return createAnthropicProvider(apiKey)
  if (isProd) {
    console.error(
      '[Voyago AI] ANTHROPIC_API_KEY is not set in production. ' +
      'Ensure the "anthropicApiKey" secret is created in Secret Manager and the ' +
      'Cloud Run service account has roles/secretmanager.secretAccessor. ' +
      'Set AI_PROVIDER=mock explicitly if you intend to run without real AI.',
    )
    throw new Error('ANTHROPIC_API_KEY is not configured in production')
  }
  // Non-production with no key → convenient dev mock.
  return createMockProvider()
}

/** Non-secret status for health checks — never exposes the key itself. */
export function aiProviderStatus(): {
  configured: boolean
  override: string | null
  usingMock: boolean
} {
  const configured = Boolean(process.env.ANTHROPIC_API_KEY)
  const override = process.env.AI_PROVIDER ?? null
  const usingMock = override === 'mock' || (!configured && override !== 'anthropic')
  return { configured, override, usingMock }
}
