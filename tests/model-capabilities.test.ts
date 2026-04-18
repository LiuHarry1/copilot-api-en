import { test, expect, describe } from "bun:test"

import type { ChatCompletionsPayload } from "../src/services/copilot/create-chat-completions"

import {
  isReasoningModel,
  normalizeTokenLimitField,
} from "../src/lib/model-capabilities"

describe("isReasoningModel", () => {
  test("matches o-series reasoning models", () => {
    expect(isReasoningModel("o1")).toBe(true)
    expect(isReasoningModel("o1-mini")).toBe(true)
    expect(isReasoningModel("o3")).toBe(true)
    expect(isReasoningModel("o3-mini")).toBe(true)
    expect(isReasoningModel("o4-mini")).toBe(true)
  })

  test("matches gpt-5.3+ models", () => {
    expect(isReasoningModel("gpt-5.3")).toBe(true)
    expect(isReasoningModel("gpt-5.4")).toBe(true)
    expect(isReasoningModel("gpt-5.4-mini")).toBe(true)
    expect(isReasoningModel("gpt-5.9")).toBe(true)
    expect(isReasoningModel("gpt-5.10")).toBe(true)
  })

  test("does not match older / non-reasoning models", () => {
    expect(isReasoningModel("gpt-4o")).toBe(false)
    expect(isReasoningModel("gpt-4")).toBe(false)
    expect(isReasoningModel("gpt-4.1")).toBe(false)
    expect(isReasoningModel("gpt-3.5-turbo")).toBe(false)
    expect(isReasoningModel("gpt-5")).toBe(false)
    expect(isReasoningModel("gpt-5.0")).toBe(false)
    expect(isReasoningModel("gpt-5.1")).toBe(false)
    expect(isReasoningModel("gpt-5.2")).toBe(false)
    expect(isReasoningModel("claude-sonnet-4")).toBe(false)
  })

  test("handles nullish input", () => {
    expect(isReasoningModel(undefined)).toBe(false)
    expect(isReasoningModel(null)).toBe(false)
    expect(isReasoningModel("")).toBe(false)
  })
})

describe("normalizeTokenLimitField", () => {
  const baseMessages: ChatCompletionsPayload["messages"] = [
    { role: "user", content: "hi" },
  ]

  test("renames max_tokens to max_completion_tokens for reasoning models", () => {
    const payload: ChatCompletionsPayload = {
      model: "gpt-5.4",
      messages: baseMessages,
      max_tokens: 1024,
    }

    const result = normalizeTokenLimitField(payload)

    expect(result.max_tokens).toBeUndefined()
    expect(result.max_completion_tokens).toBe(1024)
  })

  test("preserves existing max_completion_tokens and drops max_tokens", () => {
    const payload: ChatCompletionsPayload = {
      model: "o3-mini",
      messages: baseMessages,
      max_tokens: 1024,
      max_completion_tokens: 512,
    }

    const result = normalizeTokenLimitField(payload)

    expect(result.max_tokens).toBeUndefined()
    expect(result.max_completion_tokens).toBe(512)
  })

  test("leaves non-reasoning model payloads untouched", () => {
    const payload: ChatCompletionsPayload = {
      model: "gpt-4o",
      messages: baseMessages,
      max_tokens: 1024,
    }

    const result = normalizeTokenLimitField(payload)

    expect(result.max_tokens).toBe(1024)
    expect(result.max_completion_tokens).toBeUndefined()
  })

  test("does nothing when no token-limit field is set", () => {
    const payload: ChatCompletionsPayload = {
      model: "gpt-5.4",
      messages: baseMessages,
    }

    const result = normalizeTokenLimitField(payload)

    expect(result.max_tokens).toBeUndefined()
    expect(result.max_completion_tokens).toBeUndefined()
  })
})
