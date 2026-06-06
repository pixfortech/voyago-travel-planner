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

  if (override === 'mock') return createMockProvider()
  if (override === 'anthropic') {
    if (!apiKey) {
      throw new Error('AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set')
    }
    return createAnthropicProvider(apiKey)
  }

  return apiKey ? createAnthropicProvider(apiKey) : createMockProvider()
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
