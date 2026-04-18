import type { ChatCompletionsPayload } from "~/services/copilot/create-chat-completions"

// OpenAI reasoning-style models (o-series and GPT-5.3+) reject the legacy
// `max_tokens` parameter and require `max_completion_tokens` instead.
//
// Matches:
//   - o-series:    o1, o1-mini, o3, o3-mini, o4, o4-mini, ...
//   - GPT-5.3+:    gpt-5.3, gpt-5.4, gpt-5.4-mini, gpt-5.10, ...
//
// Does NOT match: gpt-5, gpt-5.0, gpt-5.1, gpt-5.2 (these still accept
// `max_tokens`, per upstream behavior observed at time of writing).
const REASONING_MODEL_PATTERN =
  /^(?:o\d+(?:-.*)?|gpt-5\.(?:[3-9]|\d{2,})(?:-.*)?)$/i

export function isReasoningModel(modelId: string | undefined | null): boolean {
  if (!modelId) return false
  return REASONING_MODEL_PATTERN.test(modelId)
}

/**
 * Normalize the token-limit field on an outgoing chat completions payload
 * so reasoning-style models receive `max_completion_tokens` instead of the
 * unsupported `max_tokens` field.
 *
 * Mutates and returns the payload for convenience.
 */
export function normalizeTokenLimitField(
  payload: ChatCompletionsPayload,
): ChatCompletionsPayload {
  if (!isReasoningModel(payload.model)) return payload

  if (payload.max_tokens != null) {
    if (payload.max_completion_tokens == null) {
      payload.max_completion_tokens = payload.max_tokens
    }
    delete payload.max_tokens
  }

  return payload
}
