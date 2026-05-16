import type { Context } from "hono"

import consola from "consola"
import { streamSSE, type SSEMessage } from "hono/streaming"

import { awaitApproval } from "~/lib/approval"
import { isReasoningModel } from "~/lib/model-capabilities"
import { checkRateLimit } from "~/lib/rate-limit"
import { startSseHeartbeat } from "~/lib/sse-heartbeat"
import { state } from "~/lib/state"
import { getTokenCount } from "~/lib/tokenizer"
import { isNullish } from "~/lib/utils"
import {
  createChatCompletions,
  type ChatCompletionResponse,
  type ChatCompletionsPayload,
} from "~/services/copilot/create-chat-completions"

export async function handleCompletion(c: Context) {
  await checkRateLimit(state)

  let payload = await c.req.json<ChatCompletionsPayload>()
  consola.debug("Request payload:", JSON.stringify(payload).slice(-400))

  // Find the selected model
  const selectedModel = state.models?.data.find(
    (model) => model.id === payload.model,
  )

  // Calculate and display token count
  try {
    if (selectedModel) {
      const tokenCount = await getTokenCount(payload, selectedModel)
      consola.info("Current token count:", tokenCount)
    } else {
      consola.warn("No model selected, skipping token count calculation")
    }
  } catch (error) {
    consola.warn("Failed to calculate token count:", error)
  }

  if (state.manualApprove) await awaitApproval()

  const defaultMaxTokens = selectedModel?.capabilities.limits.max_output_tokens

  if (isReasoningModel(payload.model)) {
    if (isNullish(payload.max_completion_tokens)) {
      payload = {
        ...payload,
        max_completion_tokens: payload.max_tokens ?? defaultMaxTokens,
      }
      consola.debug(
        "Set max_completion_tokens to:",
        JSON.stringify(payload.max_completion_tokens),
      )
    }
  } else if (isNullish(payload.max_tokens)) {
    payload = {
      ...payload,
      max_tokens: defaultMaxTokens,
    }
    consola.debug("Set max_tokens to:", JSON.stringify(payload.max_tokens))
  }

  const response = await createChatCompletions(payload, {
    signal: c.req.raw.signal,
  })

  if (isNonStreaming(response)) {
    consola.debug("Non-streaming response:", JSON.stringify(response))
    return c.json(response)
  }

  consola.debug("Streaming response")
  c.header("X-Accel-Buffering", "no")
  return streamSSE(c, async (stream) => {
    const heartbeat = startSseHeartbeat(stream)
    try {
      for await (const chunk of response) {
        if (stream.aborted || stream.closed) break
        consola.debug("Streaming chunk:", JSON.stringify(chunk))
        await stream.writeSSE(chunk as SSEMessage)
      }
    } catch (err) {
      consola.error("Chat completions upstream stream error:", err)
    } finally {
      heartbeat.stop()
    }
  })
}

const isNonStreaming = (
  response: Awaited<ReturnType<typeof createChatCompletions>>,
): response is ChatCompletionResponse => Object.hasOwn(response, "choices")
