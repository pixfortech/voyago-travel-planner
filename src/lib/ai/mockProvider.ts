/**
 * Development-only mock AI provider — Phase 0 foundation.
 *
 * Used as a safe fallback when ANTHROPIC_API_KEY is absent so the app and its
 * API routes keep working during development. Every response is prefixed so it
 * can NEVER be mistaken for real model output, and `isMock` is always true.
 */

import { AI_MODELS } from './models'
import type { AiProvider, AiCompleteOptions, AiCompletion } from './types'

export const MOCK_LABEL = '[DEV MOCK — not real AI output]'

export function createMockProvider(): AiProvider {
  return {
    name: 'mock',
    isMock: true,
    async complete(options: AiCompleteOptions): Promise<AiCompletion> {
      const tier = options.tier ?? 'chat'
      const lastUser = [...options.messages].reverse().find((m) => m.role === 'user')
      const echo = lastUser?.content.slice(0, 200) ?? ''
      return {
        text: `${MOCK_LABEL} (tier: ${tier}) This is a placeholder response generated locally without any AI model. Prompt preview: "${echo}"`,
        provider: 'mock',
        isMock: true,
        model: AI_MODELS[tier],
      }
    },
  }
}
