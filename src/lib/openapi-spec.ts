import {
  anthropicMessagesRequestExample,
  chatCompletionsRequestExample,
  embeddingsRequestExample,
  responsesRequestExample,
} from "~/lib/openapi-examples"

/**
 * OpenAPI 3.0 document for Swagger UI (`/docs`).
 * Request/response bodies mirror upstream OpenAI and Anthropic APIs; this spec lists routes only.
 */
export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "copilot-api",
    description: `GitHub Copilot exposed as OpenAI- and Anthropic-compatible HTTP APIs. Chat, embeddings, and responses bodies follow the upstream OpenAI API. /v1/messages follows the Anthropic Messages API. The server uses tokens from copilot-api auth (not per-request API keys unless your client sends them).`,
    version: "0.7.0",
  },
  externalDocs: {
    description: "Project README",
    url: "https://github.com/ericc-ch/copilot-api",
  },
  tags: [
    { name: "meta", description: "Health and documentation" },
    { name: "openai", description: "OpenAI-compatible endpoints" },
    { name: "anthropic", description: "Anthropic-compatible endpoints" },
    { name: "usage", description: "Copilot usage" },
  ],
  paths: {
    "/": {
      get: {
        tags: ["meta"],
        summary: "Health check",
        responses: {
          "200": {
            description: "Plain text status",
            content: {
              "text/plain": {
                schema: { type: "string", example: "Server running" },
              },
            },
          },
        },
      },
    },
    "/chat/completions": {
      post: {
        tags: ["openai"],
        summary: "Create chat completion",
        description:
          "Same as `POST /v1/chat/completions`. Body matches OpenAI Chat Completions.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description:
                  "https://platform.openai.com/docs/api-reference/chat/create",
              },
              example: chatCompletionsRequestExample,
            },
          },
        },
        responses: {
          "200": {
            description: "Completion or SSE stream",
            content: {
              "application/json": { schema: { type: "object" } },
              "text/event-stream": { schema: { type: "string" } },
            },
          },
        },
      },
    },
    "/v1/chat/completions": {
      post: {
        tags: ["openai"],
        summary: "Create chat completion (v1 prefix)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description:
                  "https://platform.openai.com/docs/api-reference/chat/create",
              },
              example: chatCompletionsRequestExample,
            },
          },
        },
        responses: {
          "200": {
            description: "Completion or SSE stream",
            content: {
              "application/json": { schema: { type: "object" } },
              "text/event-stream": { schema: { type: "string" } },
            },
          },
        },
      },
    },
    "/models": {
      get: {
        tags: ["openai"],
        summary: "List models",
        responses: {
          "200": {
            description: "OpenAI-style model list",
            content: {
              "application/json": { schema: { type: "object" } },
            },
          },
        },
      },
    },
    "/v1/models": {
      get: {
        tags: ["openai"],
        summary: "List models (v1 prefix)",
        responses: {
          "200": {
            description: "OpenAI-style model list",
            content: {
              "application/json": { schema: { type: "object" } },
            },
          },
        },
      },
    },
    "/embeddings": {
      post: {
        tags: ["openai"],
        summary: "Create embeddings",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["model", "input"],
                properties: {
                  model: { type: "string" },
                  input: {
                    oneOf: [
                      { type: "string" },
                      { type: "array", items: { type: "string" } },
                    ],
                  },
                },
              },
              example: embeddingsRequestExample,
            },
          },
        },
        responses: {
          "200": {
            description: "Embedding vectors",
            content: {
              "application/json": { schema: { type: "object" } },
            },
          },
        },
      },
    },
    "/v1/embeddings": {
      post: {
        tags: ["openai"],
        summary: "Create embeddings (v1 prefix)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["model", "input"],
                properties: {
                  model: { type: "string" },
                  input: {
                    oneOf: [
                      { type: "string" },
                      { type: "array", items: { type: "string" } },
                    ],
                  },
                },
              },
              example: embeddingsRequestExample,
            },
          },
        },
        responses: {
          "200": {
            description: "Embedding vectors",
            content: {
              "application/json": { schema: { type: "object" } },
            },
          },
        },
      },
    },
    "/responses": {
      post: {
        tags: ["openai"],
        summary: "Create response (Responses API)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description:
                  "https://platform.openai.com/docs/api-reference/responses",
              },
              example: responsesRequestExample,
            },
          },
        },
        responses: {
          "200": {
            description: "Response or stream",
            content: {
              "application/json": { schema: { type: "object" } },
              "text/event-stream": { schema: { type: "string" } },
            },
          },
        },
      },
    },
    "/v1/responses": {
      post: {
        tags: ["openai"],
        summary: "Create response (v1 prefix)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description:
                  "https://platform.openai.com/docs/api-reference/responses",
              },
              example: responsesRequestExample,
            },
          },
        },
        responses: {
          "200": {
            description: "Response or stream",
            content: {
              "application/json": { schema: { type: "object" } },
              "text/event-stream": { schema: { type: "string" } },
            },
          },
        },
      },
    },
    "/usage": {
      get: {
        tags: ["usage"],
        summary: "GitHub Copilot usage",
        responses: {
          "200": {
            description: "Usage payload from GitHub",
            content: {
              "application/json": { schema: { type: "object" } },
            },
          },
          "500": {
            description: "Failed to load usage",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/messages": {
      post: {
        tags: ["anthropic"],
        summary: "Create a message (Anthropic Messages API)",
        description:
          "https://docs.anthropic.com/en/api/messages — streaming uses SSE with Anthropic event types.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description:
                  "https://docs.anthropic.com/en/api/messages#body-model",
              },
              example: anthropicMessagesRequestExample,
            },
          },
        },
        responses: {
          "200": {
            description: "Message or event stream",
            content: {
              "application/json": { schema: { type: "object" } },
              "text/event-stream": { schema: { type: "string" } },
            },
          },
        },
      },
    },
    "/v1/messages/count_tokens": {
      post: {
        tags: ["anthropic"],
        summary: "Count tokens for a messages request",
        parameters: [
          {
            name: "anthropic-beta",
            in: "header",
            required: false,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description:
                  "Same shape as a non-streaming POST /v1/messages request body.",
              },
              example: anthropicMessagesRequestExample,
            },
          },
        },
        responses: {
          "200": {
            description: "Token counts",
            content: {
              "application/json": { schema: { type: "object" } },
            },
          },
        },
      },
    },
  },
} as const
