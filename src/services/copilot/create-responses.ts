import consola from "consola"

import { copilotBaseUrl, copilotHeaders } from "~/lib/api-config"
import { HTTPError } from "~/lib/error"
import { state } from "~/lib/state"

export interface ResponsesPayload {
  model: string
  input?: unknown
  instructions?: string | null
  stream?: boolean | null
  reasoning?: {
    effort?: "low" | "medium" | "high" | null
    summary?: "auto" | "concise" | "detailed" | null
  } | null
  tools?: Array<unknown> | null
  tool_choice?: unknown
  temperature?: number | null
  top_p?: number | null
  max_output_tokens?: number | null
  metadata?: Record<string, string> | null
  parallel_tool_calls?: boolean | null
  store?: boolean | null
  previous_response_id?: string | null
  text?: unknown
  [key: string]: unknown
}

export const createResponses = async (
  payload: ResponsesPayload,
): Promise<Response> => {
  if (!state.copilotToken) throw new Error("Copilot token not found")

  const isAgentCall = (() => {
    const input = payload.input
    if (!Array.isArray(input)) return false
    return input.some((item) => {
      if (!item || typeof item !== "object") return false
      const role = (item as { role?: string }).role
      const type = (item as { type?: string }).type
      return (
        role === "assistant"
        || role === "tool"
        || type === "function_call"
        || type === "function_call_output"
        || type === "reasoning"
      )
    })
  })()

  const headers: Record<string, string> = {
    ...copilotHeaders(state, false),
    "X-Initiator": isAgentCall ? "agent" : "user",
  }

  const response = await fetch(`${copilotBaseUrl(state)}/responses`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    consola.error("Failed to create response", response.status)
    throw new HTTPError("Failed to create response", response)
  }

  return response
}
