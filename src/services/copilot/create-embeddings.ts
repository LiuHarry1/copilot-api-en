import consola from "consola"

import type { Model } from "~/services/copilot/get-models"

import { copilotHeaders, copilotBaseUrl } from "~/lib/api-config"
import { HTTPError } from "~/lib/error"
import { state } from "~/lib/state"

function embeddingModelsFromCatalog(
  catalog: Array<Model> | undefined,
): Array<Model> {
  if (!catalog?.length) return []
  return catalog.filter((m) => {
    const type = m.capabilities.type.toLowerCase()
    const name = m.name.toLowerCase()
    const family = m.capabilities.family.toLowerCase()
    return (
      type.includes("embed")
      || m.id.toLowerCase().includes("embedding")
      || name.includes("embed")
      || family.includes("embed")
    )
  })
}

function embeddingsBadRequest(message: string): never {
  throw new HTTPError(
    message,
    new Response(
      JSON.stringify({
        error: { message, type: "invalid_request_error" },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    ),
  )
}

/**
 * Resolve which `model` string to send to Copilot `/embeddings`. Use the exact
 * `id` from `GET /models` (do not add a `publisher/model` prefix — that causes
 * 400 when the catalog lists bare ids such as `text-embedding-3-small`). When
 * the client sends an OpenAI-style name that is not in the catalog, map to the
 * first catalog embedding model if available.
 */
function resolveEmbeddingModelForCopilot(
  requested: string,
  catalog: Array<Model> | undefined,
): string {
  if (!catalog?.length) return requested

  const embeddingOnly = embeddingModelsFromCatalog(catalog)
  if (embeddingOnly.some((m) => m.id === requested)) return requested

  if (catalog.some((m) => m.id === requested)) {
    if (embeddingOnly.length > 0) {
      embeddingsBadRequest(
        `Model "${requested}" is not an embedding model. Use one of: ${embeddingOnly.map((m) => m.id).join(", ")}. GET /v1/models lists ids.`,
      )
    }
    return requested
  }

  const shortName =
    requested.includes("/") ?
      (requested.split("/").pop() ?? requested)
    : requested
  const looksLikeOpenAiEmbedding =
    shortName === "text-embedding-3-small"
    || shortName === "text-embedding-3-large"
    || shortName === "text-embedding-ada-002"
    || shortName.startsWith("text-embedding-")

  if (looksLikeOpenAiEmbedding) {
    if (embeddingOnly.length > 0) {
      const pick = embeddingOnly[0]
      consola.warn(
        `[embeddings] Replacing OpenAI-style model "${requested}" with Copilot model "${pick.id}"`,
      )
      return pick.id
    }
    return requested
  }

  if (embeddingOnly.length > 0) {
    embeddingsBadRequest(
      `Unknown embedding model "${requested}". Use one of: ${embeddingOnly.map((m) => m.id).join(", ")}. GET /v1/models lists ids.`,
    )
  }

  return requested
}

/**
 * Copilot CAPI `POST /embeddings` matches VS Code's `rawEmbeddingsFetch`: `input`
 * must be a JSON array of strings. A single OpenAI-style string must be wrapped
 * or the gateway responds 400.
 */
function buildCopilotEmbeddingBody(
  payload: EmbeddingRequest,
  resolvedModel: string,
): { model: string; input: Array<string> } {
  const input = Array.isArray(payload.input) ? payload.input : [payload.input]
  return { model: resolvedModel, input }
}

export const createEmbeddings = async (payload: EmbeddingRequest) => {
  if (!state.copilotToken) throw new Error("Copilot token not found")

  const catalog = state.models?.data
  const resolved = resolveEmbeddingModelForCopilot(payload.model, catalog)
  const body = buildCopilotEmbeddingBody(payload, resolved)

  if (resolved !== payload.model) {
    consola.debug(
      `[embeddings] model id for upstream: "${payload.model}" -> "${resolved}"`,
    )
  }

  const response = await fetch(`${copilotBaseUrl(state)}/embeddings`, {
    method: "POST",
    headers: copilotHeaders(state),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    consola.error(
      "Copilot embeddings request failed:",
      response.status,
      errorText,
    )
    throw new HTTPError(
      `Failed to create embeddings (${response.status}): ${errorText.slice(0, 500)}`,
      new Response(errorText, {
        status: response.status,
        headers: {
          "Content-Type":
            response.headers.get("content-type") ?? "application/json",
        },
      }),
    )
  }

  return (await response.json()) as EmbeddingResponse
}

export interface EmbeddingRequest {
  input: string | Array<string>
  model: string
}

export interface Embedding {
  object: string
  embedding: Array<number>
  index: number
}

export interface EmbeddingResponse {
  object: string
  data: Array<Embedding>
  model: string
  usage: {
    prompt_tokens: number
    total_tokens: number
  }
}
