#!/usr/bin/env python3
"""Pipe observable coding-agent actions through a PipeLens scope-bound session.

The bridge is provider-neutral: a Codex/Claude Code/custom wrapper can emit one
JSON object per line on stdin and read one authorization decision per line on
stdout. PipeLens never requires hidden model chain-of-thought.

Input examples:
  {"kind":"action","event":{"id":"e1","timestamp":1,"type":"open_file","target":{"file":"app.py"}}}
  {"kind":"patch","changed_files":["app.py"],"changed_line_ranges":[{"file":"app.py","start":20,"end":20}]}
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from typing import Any


def post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"PipeLens HTTP {exc.code}: {body}") from exc


def route_record(base_url: str, session_id: str, record: dict[str, Any]) -> dict[str, Any]:
    kind = record.get("kind")
    root = base_url.rstrip("/")

    if kind == "action":
        event = record.get("event")
        if not isinstance(event, dict):
            raise ValueError("action record requires an object field: event")
        return post_json(f"{root}/api/agent-sessions/{session_id}/actions", {"event": event})

    if kind == "patch":
        payload = {
            "changed_files": record.get("changed_files", []),
            "changed_line_ranges": record.get("changed_line_ranges", []),
            "unified_diff": record.get("unified_diff", ""),
        }
        return post_json(f"{root}/api/agent-sessions/{session_id}/candidate-patch", payload)

    raise ValueError(f"unsupported bridge record kind: {kind!r}")


def main() -> int:
    parser = argparse.ArgumentParser(description="PipeLens JSONL coding-agent bridge")
    parser.add_argument("--session-id", required=True, help="scope-bound PipeLens Agent Session ID")
    parser.add_argument("--base-url", default="http://localhost:8000", help="PipeLens API base URL")
    args = parser.parse_args()

    for line_number, raw in enumerate(sys.stdin, start=1):
        raw = raw.strip()
        if not raw:
            continue
        try:
            record = json.loads(raw)
            if not isinstance(record, dict):
                raise ValueError("each JSONL record must be an object")
            decision = route_record(args.base_url, args.session_id, record)
            print(json.dumps({"ok": True, "decision": decision}, ensure_ascii=False), flush=True)
        except Exception as exc:  # bridge must return a machine-readable rejection/error
            print(
                json.dumps(
                    {"ok": False, "line": line_number, "error": str(exc)},
                    ensure_ascii=False,
                ),
                flush=True,
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
