#!/usr/bin/env bun
/**
 * Probe whether a Messages-compatible endpoint returns `thinking` / reasoning blocks.
 *
 * Targets:
 * - Local copilot-api: `http://localhost:4141/v1/messages` (default) — thinking is usually dropped upstream.
 * - Local copilot-api chat completions passthrough: `--mode chat --url http://localhost:4141/v1/chat/completions`.
 * - Anthropic API: `--provider anthropic` — uses ANTHROPIC_API_KEY from the environment.
 *
 * Never pass tokens on the CLI; use environment variables only.
 *
 * Usage:
 *   bun run explore-thinking
 *   bun run explore-thinking -- --url http://localhost:4141/v1/messages --model claude-sonnet-4
 *   bun run explore-thinking -- --provider anthropic --model claude-sonnet-4-6
 */

const DEFAULT_LOCAL_URL = "http://localhost:4141/v1/messages"
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"

const PROMPT =
  "You must use extended reasoning. How many distinct primes divide 2310? Reply with the count only after a short justification."

type ContentBlock = { type?: string; thinking?: string; text?: string }

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined
  return process.argv[idx + 1]
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

function summarizeAnthropicContent(content: unknown): void {
  if (!Array.isArray(content)) {
    console.log("  content: (not an array)", typeof content)
    return
  }
  const blocks = content as Array<ContentBlock>
  const types = blocks.map((b) => b.type ?? "?")
  console.log("  content block types:", types.join(", ") || "(empty)")
  for (const [i, block] of blocks.entries()) {
    if (block.type === "thinking" && typeof block.thinking === "string") {
      const preview = block.thinking.slice(0, 320)
      console.log(
        `  thinking[${i}] length=${block.thinking.length} preview:\n---\n${preview}\n---`,
      )
    }
    if (block.type === "text" && typeof block.text === "string") {
      console.log(`  text[${i}] length=${block.text.length}`)
    }
  }
}

interface ProbeCase {
  id: string
  buildBody: (model: string) => Record<string, unknown>
}

function summarizeOpenAIChoices(json: Record<string, unknown>): void {
  const choices = json.choices as
    | Array<{
        finish_reason?: string
        message?: Record<string, unknown>
      }>
    | undefined
  if (!Array.isArray(choices)) {
    console.log("  (no choices)")
    return
  }
  for (const [i, ch] of choices.entries()) {
    console.log(`  choice[${i}] finish_reason=${ch.finish_reason}`)
    const msg = ch.message ?? {}
    const keys = Object.keys(msg)
    console.log(`  choice[${i}] message keys: ${keys.join(", ")}`)
    for (const key of keys) {
      const value = msg[key]
      if (typeof value === "string") {
        console.log(
          `    ${key} (string, len=${value.length}): ${value.slice(0, 200)}`,
        )
      } else if (value === null) {
        console.log(`    ${key}: null`)
      } else {
        const preview = JSON.stringify(value).slice(0, 400)
        console.log(`    ${key}: ${preview}`)
      }
    }
  }
}

const chatCases: Array<ProbeCase> = [
  {
    id: "chat_no_thinking",
    buildBody: (model) => ({
      model,
      max_tokens: 2048,
      stream: false,
      messages: [{ role: "user", content: PROMPT }],
    }),
  },
  {
    id: "chat_anthropic_thinking_field",
    buildBody: (model) => ({
      model,
      max_tokens: 8192,
      stream: false,
      thinking: { type: "enabled", budget_tokens: 4096 },
      messages: [{ role: "user", content: PROMPT }],
    }),
  },
  {
    id: "chat_reasoning_effort_high",
    buildBody: (model) => ({
      model,
      max_tokens: 8192,
      stream: false,
      reasoning_effort: "high",
      messages: [{ role: "user", content: PROMPT }],
    }),
  },
  {
    id: "chat_extra_body_reasoning",
    buildBody: (model) => ({
      model,
      max_tokens: 8192,
      stream: false,
      reasoning: { effort: "high" },
      messages: [{ role: "user", content: PROMPT }],
    }),
  },
]

const responsesCases: Array<ProbeCase> = [
  {
    id: "responses_baseline",
    buildBody: (model) => ({
      model,
      input: [{ role: "user", content: PROMPT }],
      max_output_tokens: 2048,
      stream: false,
    }),
  },
  {
    id: "responses_reasoning_high_summary_auto",
    buildBody: (model) => ({
      model,
      input: [{ role: "user", content: PROMPT }],
      max_output_tokens: 4096,
      stream: false,
      reasoning: { effort: "high", summary: "auto" },
    }),
  },
  {
    id: "responses_reasoning_low_summary_detailed",
    buildBody: (model) => ({
      model,
      input: [{ role: "user", content: PROMPT }],
      max_output_tokens: 4096,
      stream: false,
      reasoning: { effort: "low", summary: "detailed" },
    }),
  },
]

const cases: Array<ProbeCase> = [
  {
    id: "no_thinking",
    buildBody: (model) => ({
      model,
      max_tokens: 2048,
      temperature: 1,
      stream: false,
      messages: [{ role: "user", content: PROMPT }],
    }),
  },
  {
    id: "thinking_enabled_budget_summarized",
    buildBody: (model) => ({
      model,
      max_tokens: 8192,
      temperature: 1,
      stream: false,
      thinking: {
        type: "enabled",
        budget_tokens: 4096,
        display: "summarized",
      },
      messages: [{ role: "user", content: PROMPT }],
    }),
  },
  {
    id: "thinking_enabled_budget_default_display",
    buildBody: (model) => ({
      model,
      max_tokens: 8192,
      temperature: 1,
      stream: false,
      thinking: {
        type: "enabled",
        budget_tokens: 4096,
      },
      messages: [{ role: "user", content: PROMPT }],
    }),
  },
  {
    id: "thinking_adaptive_budget_only",
    buildBody: (model) => ({
      model,
      max_tokens: 8192,
      temperature: 1,
      stream: false,
      thinking: {
        type: "adaptive",
        budget_tokens: 6000,
      },
      messages: [{ role: "user", content: PROMPT }],
    }),
  },
  {
    id: "thinking_adaptive_with_effort_high",
    buildBody: (model) => ({
      model,
      max_tokens: 8192,
      temperature: 1,
      stream: false,
      thinking: {
        type: "adaptive",
        budget_tokens: 6000,
        effort: "high",
      },
      messages: [{ role: "user", content: PROMPT }],
    }),
  },
]

async function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text) as unknown
  } catch {
    json = null
  }
  return { ok: res.ok, status: res.status, json, text }
}

function printError(json: unknown, text: string): void {
  if (json && typeof json === "object") {
    console.log("  error JSON:", JSON.stringify(json, null, 2).slice(0, 2000))
  } else {
    console.log("  raw body (truncated):", text.slice(0, 2000))
  }
}

interface RunConfig {
  targetUrl: string
  model: string
  mode: string
  selected: Array<ProbeCase>
  headers: Record<string, string>
}

function resolveTarget(): {
  targetUrl: string
  headers: Record<string, string>
} {
  const provider = getArg("--provider") ?? "http"
  const url = getArg("--url") ?? DEFAULT_LOCAL_URL
  const headers: Record<string, string> = {}
  if (provider !== "anthropic") return { targetUrl: url, headers }

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    console.error(
      "Set ANTHROPIC_API_KEY in the environment for --provider anthropic",
    )
    process.exit(1)
  }
  headers["x-api-key"] = key
  headers["anthropic-version"] = ANTHROPIC_VERSION
  return { targetUrl: ANTHROPIC_MESSAGES_URL, headers }
}

function resolveCases(mode: string): Array<ProbeCase> {
  const only = getArg("--only")
  let activeCases: Array<ProbeCase>
  if (mode === "chat") {
    activeCases = chatCases
  } else if (mode === "responses") {
    activeCases = responsesCases
  } else {
    activeCases = cases
  }
  const selected = only ? activeCases.filter((c) => c.id === only) : activeCases
  if (selected.length === 0) {
    console.error(`No cases matched --only ${only}`)
    process.exit(1)
  }
  return selected
}

function summarizeResponses(json: Record<string, unknown>): void {
  const out = json.output as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(out)) {
    console.log("  output: (not an array)")
    return
  }
  const types = out.map((item) =>
    typeof item.type === "string" ? item.type : "?",
  )
  console.log("  output item types:", types.join(", ") || "(empty)")
  for (const [i, item] of out.entries()) {
    if (item.type === "reasoning") {
      const summary = item.summary as
        | Array<{ type?: string; text?: string }>
        | undefined
      const parts = (summary ?? []).map(
        (s) =>
          `${s.type ?? "?"}(len=${typeof s.text === "string" ? s.text.length : 0})`,
      )
      console.log(`  reasoning[${i}] summary parts: ${parts.join(", ")}`)
      for (const s of summary ?? []) {
        if (typeof s.text === "string" && s.text.length > 0) {
          console.log(`    summary text preview: ${s.text.slice(0, 320)}`)
        }
      }
    }
    if (item.type === "message") {
      const content = item.content as
        | Array<{ type?: string; text?: string }>
        | undefined
      for (const part of content ?? []) {
        if (typeof part.text === "string") {
          console.log(
            `  message text (len=${part.text.length}): ${part.text.slice(0, 200)}`,
          )
        }
      }
    }
  }
}

function summarizeOk(mode: string, json: Record<string, unknown>): void {
  if (mode === "chat") {
    summarizeOpenAIChoices(json)
    return
  }
  if (mode === "responses") {
    summarizeResponses(json)
    return
  }
  const msg = json as { content?: unknown; stop_reason?: unknown }
  console.log("stop_reason:", msg.stop_reason)
  summarizeAnthropicContent(msg.content)
}

async function runOne(probe: ProbeCase, config: RunConfig): Promise<void> {
  const body = probe.buildBody(config.model)
  console.log("\n==============================================")
  console.log(`Case: ${probe.id}`)
  console.log("==============================================")
  const { ok, status, json, text } = await postJson(
    config.targetUrl,
    body,
    config.headers,
  )
  console.log(`HTTP ${status} ${ok ? "OK" : "ERROR"}`)
  if (!ok) {
    printError(json, text)
    return
  }
  if (!json || typeof json !== "object") {
    console.log("Unexpected non-object JSON")
    printError(json, text)
    return
  }
  summarizeOk(config.mode, json as Record<string, unknown>)
}

async function main(): Promise<void> {
  const mode = getArg("--mode") ?? "messages"
  const provider = getArg("--provider") ?? "http"
  const model =
    getArg("--model")
    ?? (provider === "anthropic" ? "claude-sonnet-4-6" : "claude-sonnet-4")
  const dry = hasFlag("--dry-run")
  const { targetUrl, headers } = resolveTarget()
  const selected = resolveCases(mode)

  console.log(`Target: ${targetUrl}`)
  console.log(`Mode:   ${mode}`)
  console.log(`Model:  ${model}`)
  console.log(`Cases:  ${selected.map((c) => c.id).join(", ")}`)

  if (dry) {
    for (const c of selected) {
      console.log("\n--- dry-run:", c.id, "---")
      console.log(JSON.stringify(c.buildBody(model), null, 2))
    }
    return
  }

  const config: RunConfig = { targetUrl, model, mode, selected, headers }
  for (const probe of selected) {
    await runOne(probe, config)
  }

  console.log(
    "\nDone. If `thinking` never appears via local copilot-api, the proxy likely strips the request field and/or Copilot does not return reasoning deltas.",
  )
}

await main()
