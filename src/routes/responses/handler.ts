import type { Context } from "hono"

import consola from "consola"
import { stream } from "hono/streaming"

import { awaitApproval } from "~/lib/approval"
import { checkRateLimit } from "~/lib/rate-limit"
import { state } from "~/lib/state"
import {
  createResponses,
  type ResponsesPayload,
} from "~/services/copilot/create-responses"

export async function handleResponses(c: Context) {
  await checkRateLimit(state)

  const payload = await c.req.json<ResponsesPayload>()
  consola.debug(
    "Responses request payload:",
    JSON.stringify(payload).slice(-400),
  )

  if (state.manualApprove) await awaitApproval()

  const upstream = await createResponses(payload)

  const isStream =
    payload.stream === true
    || (upstream.headers.get("content-type") ?? "").includes(
      "text/event-stream",
    )

  if (!isStream) {
    const data = (await upstream.json()) as Record<string, unknown>
    normalizeFinalResponseIds(data)
    consola.debug("Non-streaming response received")
    return c.json(data)
  }

  consola.debug("Streaming response (id-normalized passthrough)")

  c.header("Content-Type", "text/event-stream")
  c.header("Cache-Control", "no-cache")
  c.header("Connection", "keep-alive")

  return stream(c, async (writer) => {
    const body = upstream.body
    if (!body) {
      await writer.close()
      return
    }

    writer.onAbort(async () => {
      try {
        await body.cancel()
      } catch {
        // ignore
      }
    })

    const reader = body.getReader() as ReadableStreamDefaultReader<Uint8Array>
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    let buffer = ""
    const idMap = new Map<number, string>()

    const flushBlock = async (block: string) => {
      if (block.trim().length === 0) return
      const normalized = normalizeSseBlock(block, idMap)
      await writer.write(encoder.encode(normalized + "\n\n"))
    }

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        let sep = buffer.indexOf("\n\n")
        while (sep !== -1) {
          const block = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          await flushBlock(block)
          sep = buffer.indexOf("\n\n")
        }
      }

      buffer += decoder.decode()
      if (buffer.length > 0) await flushBlock(buffer)
    } finally {
      reader.releaseLock()
    }
  })
}

// GitHub's upstream Responses API rotates the encrypted `id`/`item_id` on
// every event, even when they refer to the same logical output item. OpenAI's
// official spec uses stable ids per item. AI SDK (and other strict clients)
// key their internal maps by `id`, so they crash on `output_item.done` because
// the id doesn't match the prior `output_item.added`.
//
// Fix: normalize all item-level ids by `output_index` — the first id we see
// for a given index becomes the canonical id, and we rewrite every subsequent
// event referencing that index to use the same id.
//
// Caveat: this breaks stateful follow-ups that pass these encrypted ids back
// upstream (e.g. via `previous_response_id` chaining individual items).
// Acceptable trade-off: most clients use the API statelessly.

function normalizeSseBlock(block: string, idMap: Map<number, string>): string {
  const lines = block.split("\n")
  const dataIdx = lines.findIndex((l) => l.startsWith("data:"))
  if (dataIdx === -1) return block

  const dataStr = lines[dataIdx].slice(5).trimStart()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(dataStr) as Record<string, unknown>
  } catch {
    return block
  }

  normalizeEventIds(parsed, idMap)
  lines[dataIdx] = "data: " + JSON.stringify(parsed)
  return lines.join("\n")
}

function normalizeEventIds(
  data: Record<string, unknown>,
  idMap: Map<number, string>,
): void {
  const outputIndex =
    typeof data.output_index === "number" ? data.output_index : undefined

  if (outputIndex !== undefined) {
    const item = data.item as { id?: unknown } | undefined
    if (item && typeof item.id === "string") {
      const existing = idMap.get(outputIndex)
      if (existing === undefined) idMap.set(outputIndex, item.id)
      else item.id = existing
    }

    if (typeof data.item_id === "string") {
      const existing = idMap.get(outputIndex)
      if (existing === undefined) idMap.set(outputIndex, data.item_id)
      else data.item_id = existing
    }
  }

  const response = data.response as
    | { output?: Array<Record<string, unknown>> }
    | undefined
  if (response && Array.isArray(response.output)) {
    for (const [idx, outItem] of response.output.entries()) {
      const existing = idMap.get(idx)
      if (existing && typeof outItem.id === "string") {
        outItem.id = existing
      }
    }
  }
}

function normalizeFinalResponseIds(data: Record<string, unknown>): void {
  const output = (data as { output?: Array<Record<string, unknown>> }).output
  if (!Array.isArray(output)) return

  const idMap = new Map<number, string>()
  for (const [idx, item] of output.entries()) {
    if (typeof item.id === "string") idMap.set(idx, item.id)
  }

  for (const [idx, item] of output.entries()) {
    const id = idMap.get(idx)
    if (id) item.id = id
  }
}
