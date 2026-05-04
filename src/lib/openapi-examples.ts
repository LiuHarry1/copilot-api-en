/** Shown in Swagger UI; replace with an `id` from `GET /v1/models`. */
const swaggerModelPlaceholder = "<paste model id from GET /v1/models>"

export const responsesRequestExample = {
  model: swaggerModelPlaceholder,
  input: "Your prompt here",
}

export const chatCompletionsRequestExample = {
  model: swaggerModelPlaceholder,
  messages: [{ role: "user", content: "Your prompt here" }],
}

export const embeddingsRequestExample = {
  model: swaggerModelPlaceholder,
  input: "Text to embed here",
}

export const anthropicMessagesRequestExample = {
  model: swaggerModelPlaceholder,
  max_tokens: 1024,
  messages: [{ role: "user", content: "Your prompt here" }],
}
