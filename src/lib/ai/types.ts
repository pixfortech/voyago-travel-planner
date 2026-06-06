/**
 * Shared AI provider contract — Phase 0 foundation.
 *
 * The app talks to a single `AiProvider` interface. In production it is backed
 * by Anthropic Claude; in development without a key it falls back to a clearly
 * labelled mock so the app never breaks. No real generation is wired in Phase 0.
 */

import type { AiModelTier } from './models'

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiCompleteOptions {
  /** Which model tier to use. Defaults to 'chat'. */
  tier?: AiModelTier
  /** Optional system prompt. */
  system?: string
  /** Max output tokens. Defaults to a conservative value. */
  maxTokens?: number
  /** Conversation so far (must start with a user message). */
  messages: AiMessage[]
}

export interface AiCompletion {
  text: string
  provider: AiProviderName
  /** True when the response came from the development mock, NOT a real model. */
  isMock: boolean
  model: string
}

export type AiProviderName = 'anthropic' | 'mock'

export interface AiProvider {
  readonly name: AiProviderName
  readonly isMock: boolean
  complete(options: AiCompleteOptions): Promise<AiCompletion>
}
