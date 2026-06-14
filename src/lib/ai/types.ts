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
  /**
   * For the `generation` tier, request the premium model (Opus 4.8) instead of
   * the default. Falls back to the ANTHROPIC_USE_PREMIUM env toggle when unset.
   */
  premium?: boolean
}

/** Token usage reported by the model (mirrors Anthropic's `message.usage`). */
export interface AiUsage {
  inputTokens: number
  outputTokens: number
  /** Tokens written to the prompt cache, when prompt caching is used. */
  cacheCreationInputTokens?: number
  /** Tokens served from the prompt cache, when prompt caching is used. */
  cacheReadInputTokens?: number
}

export interface AiCompletion {
  text: string
  provider: AiProviderName
  /** True when the response came from the development mock, NOT a real model. */
  isMock: boolean
  model: string
  /** Token usage for cost tracking. Absent/zeroed for the mock provider. */
  usage?: AiUsage
}

export type AiProviderName = 'anthropic' | 'mock'

export interface AiProvider {
  readonly name: AiProviderName
  readonly isMock: boolean
  complete(options: AiCompleteOptions): Promise<AiCompletion>
  /**
   * Optional: count the input tokens of a prompt WITHOUT generating. Used only
   * for opt-in debug cost estimation (AI_DEBUG_COST=true) — it costs an extra
   * API round-trip, so it is never called on the default production path.
   */
  countTokens?(options: AiCompleteOptions): Promise<number>
}
