import consola from "consola"

// Detects the family of "socket was closed by the other side" errors thrown
// by undici / Bun's fetch implementation. These errors are usually caused by
// a half-dead keep-alive connection in the pool, NOT by a real upstream
// failure, so they are safe to retry once before any response byte has been
// emitted to the client.
export function isTerminatedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false

  const message = err.message || ""
  const cause = (err as { cause?: { code?: string; message?: string } }).cause
  const causeMessage = cause?.message ?? ""
  const causeCode = cause?.code ?? ""

  return (
    message.includes("terminated")
    || message.includes("other side closed")
    || message.includes("fetch failed")
    || causeMessage.includes("other side closed")
    || causeMessage.includes("terminated")
    || causeCode === "UND_ERR_SOCKET"
    || causeCode === "ECONNRESET"
    || causeCode === "ECONNREFUSED"
    || causeCode === "EPIPE"
  )
}

export interface FetchUpstreamOptions extends RequestInit {
  // Maximum number of *additional* retries on `terminated`-class errors.
  // Defaults to 1 (i.e. one initial attempt + one retry).
  retries?: number
  // Optional label used in log messages.
  label?: string
}

// Wraps `fetch` with a single retry on transient socket-closed errors that
// happen BEFORE any response headers are received. Once we have a Response
// object back, we never retry, because the body may already be partially
// streaming to the client.
export async function fetchUpstream(
  url: string,
  options: FetchUpstreamOptions = {},
): Promise<Response> {
  const { retries = 1, label = "upstream", ...init } = options

  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, init)
    } catch (err) {
      lastErr = err
      if (!isTerminatedError(err) || attempt === retries) throw err
      // Don't retry if the caller aborted (e.g. client disconnected).
      if (init.signal?.aborted) throw err
      consola.warn(
        `[${label}] fetch terminated by remote, retrying (attempt ${attempt + 2}/${retries + 1})`,
      )
    }
  }
  throw lastErr
}
