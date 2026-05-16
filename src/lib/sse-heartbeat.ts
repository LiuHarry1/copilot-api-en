import consola from "consola"

// Minimal surface area we need from hono's stream / streamSSE writers.
// Both `StreamingApi` and `SSEStreamingApi` expose `.write()`, `.aborted`
// and `.closed`, so this works for both /chat/completions and /responses
// /messages handlers without binding us to a concrete type.
interface HeartbeatWriter {
  write: (data: string | Uint8Array) => Promise<unknown>
  aborted: boolean
  closed: boolean
}

// Default interval is intentionally shorter than:
//   * Bun.serve default idleTimeout (10s)
//   * AWS ALB idle timeout (60s)
//   * Cloudflare idle timeout (100s)
//   * Most corporate proxy idle timeouts (30-60s)
// so the bytes on the wire keep all of them happy during long reasoning
// pauses where the upstream model produces no tokens for tens of seconds.
const DEFAULT_INTERVAL_MS = 8000

// SSE comment frame. Any line beginning with `:` is a comment per the SSE
// spec and is silently discarded by every compliant client (EventSource,
// OpenAI SDK, Anthropic SDK, Vercel AI SDK, LangChain, ...).
const HEARTBEAT_FRAME = ": ping\n\n"

export interface HeartbeatHandle {
  stop: () => void
}

// Starts periodic SSE heartbeats on `writer`. Returns a handle whose `stop()`
// is idempotent. The heartbeat automatically self-terminates if the writer is
// aborted/closed or if a write fails.
export function startSseHeartbeat(
  writer: HeartbeatWriter,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): HeartbeatHandle {
  let stopped = false

  const timer = setInterval(() => {
    if (stopped) return
    if (writer.aborted || writer.closed) {
      stop()
      return
    }
    writer.write(HEARTBEAT_FRAME).catch((err: unknown) => {
      consola.debug("SSE heartbeat write failed, stopping:", err)
      stop()
    })
  }, intervalMs)

  // Don't keep the event loop alive just for heartbeats.
  if (typeof timer === "object" && "unref" in timer) {
    ;(timer as { unref: () => void }).unref()
  }

  const stop = () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
  }

  return { stop }
}
