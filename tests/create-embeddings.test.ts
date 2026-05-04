import { expect, mock, test } from "bun:test"

import type { Model } from "../src/services/copilot/get-models"

import { state } from "../src/lib/state"
import { createEmbeddings } from "../src/services/copilot/create-embeddings"

function embeddingModel(overrides: Partial<Model> = {}): Model {
  return {
    capabilities: {
      family: "text-embedding",
      limits: {},
      object: "model.capabilities",
      supports: {},
      tokenizer: "o200k_base",
      type: "embeddings",
      ...overrides.capabilities,
    },
    id: "text-embedding-3-small",
    model_picker_enabled: true,
    name: "Text Embedding 3 Small",
    object: "model",
    preview: false,
    vendor: "OpenAI",
    version: "1",
    ...overrides,
  }
}

state.copilotToken = "test-token"
state.vsCodeVersion = "1.0.0"
state.accountType = "individual"

const fetchMock = mock((_url: string, _opts: { body?: string }) =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        object: "list",
        data: [
          {
            object: "embedding",
            embedding: [0.1, 0.2],
            index: 0,
          },
        ],
        model: "text-embedding-3-small",
        usage: { prompt_tokens: 3, total_tokens: 3 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  ),
)
// @ts-expect-error - Mock fetch doesn't implement all fetch properties
;(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock

test("forwards catalog embedding model id unchanged and wraps string input", async () => {
  for (const modelId of [
    "text-embedding-3-small",
    "openai/text-embedding-3-small",
  ] as const) {
    fetchMock.mockClear()
    state.models = {
      object: "list",
      data: [embeddingModel({ id: modelId })],
    }

    await createEmbeddings({
      model: modelId,
      input: "how are you",
    })

    expect(fetchMock).toHaveBeenCalled()
    const opts = fetchMock.mock.calls[0][1] as { body: string }
    const body = JSON.parse(opts.body) as {
      model: string
      input: Array<string>
    }
    expect(body.model).toBe(modelId)
    expect(body.input).toEqual(["how are you"])
  }
})

test("passes through array input unchanged", async () => {
  fetchMock.mockClear()
  state.models = {
    object: "list",
    data: [embeddingModel()],
  }

  await createEmbeddings({
    model: "text-embedding-3-small",
    input: ["a", "b"],
  })

  const opts = fetchMock.mock.calls[0][1] as { body: string }
  const body = JSON.parse(opts.body) as { input: Array<string> }
  expect(body.input).toEqual(["a", "b"])
})
