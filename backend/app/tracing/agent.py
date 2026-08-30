from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

from app.models.trace import AgentEvent


def normalize_agent_events(payload: Iterable[dict[str, Any]]) -> list[AgentEvent]:
    """Validate and time-order observable coding-agent events.

    PipeLens only records externally observable actions such as search, file
    inspection, tests, patches, and executions. Hidden chain-of-thought is not
    part of this schema.
    """

    events = [AgentEvent.model_validate(item) for item in payload]
    events.sort(key=lambda event: (event.timestamp, event.id))
    return events


def load_agent_events(path: str | Path) -> list[AgentEvent]:
    path = Path(path)
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("Agent trace JSON must contain a list of events")
    return normalize_agent_events(payload)
