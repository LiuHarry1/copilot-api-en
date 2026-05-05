#!/usr/bin/env python3
"""
Smoke-test vision (image + dog question) against copilot-api:
  POST {base}/chat/completions
  POST {base}/responses

Uses only the stdlib (no requests). Defaults match local proxy usage.

Manual integration script — not run by `bun test` (that runner picks up `*.test.ts`).
Run: python tests/test_vision_endpoints.py
"""

from __future__ import annotations

import argparse
import base64
import http.client
import json
import mimetypes
import ssl
import sys
from pathlib import Path
from urllib.parse import urlparse


def image_to_data_url(path: Path) -> str:
    raw = path.read_bytes()
    mime, _ = mimetypes.guess_type(path.name)
    if not mime or not mime.startswith("image/"):
        mime = "image/png"
    b64 = base64.standard_b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{b64}"


def post_json(url: str, payload: object, timeout: float) -> tuple[int, object]:
    """POST JSON using http.client (avoids urllib quirks on Python 3.12 + some proxies → 502)."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Unsupported URL scheme: {parsed.scheme!r}")
    host = parsed.hostname
    if not host:
        raise ValueError("URL must include a host")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"

    data = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Content-Length": str(len(data)),
    }

    if parsed.scheme == "https":
        ctx = ssl.create_default_context()
        conn = http.client.HTTPSConnection(host, port, timeout=timeout, context=ctx)
    else:
        conn = http.client.HTTPConnection(host, port, timeout=timeout)

    try:
        conn.request("POST", path, body=data, headers=headers)
        resp = conn.getresponse()
        raw = resp.read().decode("utf-8", errors="replace")
        status = resp.status
        try:
            return status, json.loads(raw)
        except json.JSONDecodeError:
            return status, {"_raw": raw}
    finally:
        conn.close()


def extract_chat_completion_text(resp: object) -> str:
    if not isinstance(resp, dict):
        return str(resp)
    choices = resp.get("choices")
    if not isinstance(choices, list) or not choices:
        return json.dumps(resp, indent=2)[:4000]
    msg = choices[0].get("message") if isinstance(choices[0], dict) else None
    if isinstance(msg, dict):
        content = msg.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for p in content:
                if isinstance(p, dict) and p.get("type") == "text":
                    parts.append(str(p.get("text", "")))
            if parts:
                return "\n".join(parts)
    return json.dumps(resp, indent=2)[:4000]


def extract_responses_text(resp: object) -> str:
    if not isinstance(resp, dict):
        return str(resp)
    out = resp.get("output")
    if not isinstance(out, list):
        return json.dumps(resp, indent=2)[:4000]
    chunks: list[str] = []
    for item in out:
        if not isinstance(item, dict):
            continue
        if item.get("type") != "message":
            continue
        content = item.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if isinstance(block, dict) and block.get("type") == "output_text":
                chunks.append(str(block.get("text", "")))
    if chunks:
        return "\n".join(chunks)
    return json.dumps(resp, indent=2)[:4000]


def run_chat_completions(base: str, model: str, data_url: str, timeout: float) -> None:
    url = f"{base.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "stream": False,
        "max_tokens": 512,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Is there a dog in this image? Answer briefly."},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
    }
    status, body = post_json(url, payload, timeout)
    print(f"\n=== POST {url} ===\nHTTP {status}\n")
    if status >= 400:
        print(json.dumps(body, indent=2, ensure_ascii=False))
        raise SystemExit(1)
    print(extract_chat_completion_text(body))


def run_responses(base: str, model: str, data_url: str, timeout: float) -> None:
    url = f"{base.rstrip('/')}/responses"
    payload = {
        "model": model,
        "stream": False,
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": "Is there a dog in this image? Answer briefly.",
                    },
                    {"type": "input_image", "image_url": data_url},
                ],
            }
        ],
    }
    status, body = post_json(url, payload, timeout)
    print(f"\n=== POST {url} ===\nHTTP {status}\n")
    if status >= 400:
        print(json.dumps(body, indent=2, ensure_ascii=False))
        raise SystemExit(1)
    print(extract_responses_text(body))


def main() -> None:
    parser = argparse.ArgumentParser(description="Test vision on chat/completions and responses.")
    parser.add_argument(
        "--base-url",
        default="http://localhost:4141",
        help="copilot-api base URL (no trailing path)",
    )
    parser.add_argument("--model", default="gpt-5.2")
    parser.add_argument(
        "--image",
        type=Path,
        default=Path("/Users/harry/Desktop/sun_image.png"),
        help="Local image file path",
    )
    parser.add_argument("--timeout", type=float, default=120.0)
    args = parser.parse_args()

    if not args.image.is_file():
        print(f"Image not found: {args.image}", file=sys.stderr)
        raise SystemExit(2)

    data_url = image_to_data_url(args.image)
    print(f"Image: {args.image} ({len(data_url)} chars data URL prefix: {data_url[:48]}...)")

    run_chat_completions(args.base_url, args.model, data_url, args.timeout)
    run_responses(args.base_url, args.model, data_url, args.timeout)
    print("\nDone.")


if __name__ == "__main__":
    main()
