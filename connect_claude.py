import anthropic

client = anthropic.Anthropic(
    api_key="dummpy",
    base_url="http://localhost:4141"
)
print("before calling creating")
message = client.messages.create(
    model="claude-sonnet-4",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Hello, ZHIPU"}
    ]
)
print(message)