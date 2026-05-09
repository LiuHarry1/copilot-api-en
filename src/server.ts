import { swaggerUI } from "@hono/swagger-ui"
import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { createRequire } from "node:module"
import { dirname } from "node:path"

import { openApiDocument } from "~/lib/openapi-spec"

import { completionRoutes } from "./routes/chat-completions/route"
import { embeddingRoutes } from "./routes/embeddings/route"
import { messageRoutes } from "./routes/messages/route"
import { modelRoutes } from "./routes/models/route"
import { responsesRoutes } from "./routes/responses/route"
import { usageRoute } from "./routes/usage/route"

export const server = new Hono()

const require = createRequire(import.meta.url)
const swaggerUIDistRoot = dirname(
  require.resolve("swagger-ui-dist/package.json"),
)

server.use(logger())
server.use(cors())
server.use(
  "/swagger-ui-dist/*",
  serveStatic({
    root: swaggerUIDistRoot,
    rewriteRequestPath: (path) =>
      path.startsWith("/swagger-ui-dist/") ?
        path.slice("/swagger-ui-dist/".length)
      : path,
  }),
)

server.get("/", (c) => c.text("Server running"))

server.get("/openapi.json", (c) => c.json(openApiDocument))
server.get(
  "/docs",
  swaggerUI({
    url: "/openapi.json",
    /** Same-origin assets so /docs works without CDN (firewalls, offline, etc.). */
    baseUrl: "",
  }),
)

server.route("/chat/completions", completionRoutes)
server.route("/models", modelRoutes)
server.route("/embeddings", embeddingRoutes)
server.route("/responses", responsesRoutes)
server.route("/usage", usageRoute)

// Compatibility with tools that expect v1/ prefix
server.route("/v1/chat/completions", completionRoutes)
server.route("/v1/models", modelRoutes)
server.route("/v1/embeddings", embeddingRoutes)
server.route("/v1/responses", responsesRoutes)

// Anthropic compatible endpoints
server.route("/v1/messages", messageRoutes)
