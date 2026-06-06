/**
 * Anthropic Claude provider — Phase 0 foundation (structure only).
 *
 * This is the real provider used once ANTHROPIC_API_KEY is configured in the
 * deployment environment. The Claude SDK client is created lazily, so importing
 * this module is cheap and never throws when the key is absent. No AI route
 * actually invokes `complete()` in Phase 0 — generation is wired up in Phase 4.
 */

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS, ADAPTIVE_THINKING_TIERS } from './models'
import type { AiProvider, AiCompleteOptions, AiCompletion } from './types'

let client: Anthropic | null = null

function getClient(apiKey: string): Anthropic {
  if (!client) client = new Anthropic({ apiKey })
  return client
}

export function createAnthropicProvider(apiKey: string): AiProvider {
  return {
    name: 'anthropic',
    isMock: false,
    async complete(options: AiCompleteOptions): Promise<AiCompletion> {
      const tier = options.tier ?? 'chat'
      const model = AI_MODELS[tier]

      const message = await getClient(apiKey).messages.create({
        model,
        max_tokens: options.maxTokens ?? 4096,
        ...(ADAPTIVE_THINKING_TIERS.has(tier)
          ? { thinking: { type: 'adaptive' as const } }
          : {}),
        ...(options.system ? { system: options.system } : {}),
        messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
      })

      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')

      return { text, provider: 'anthropic', isMock: false, model }
    },
  }
}
