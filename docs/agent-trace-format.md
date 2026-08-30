# Observable Coding-Agent Trace Format

PipeLens treats coding-agent exploration as a sequence of **observable actions**. The format intentionally excludes hidden chain-of-thought and only stores actions that can be grounded in tool use, repository navigation, tests, patches, or execution.

## Event Schema

```json
{
  "id": "evt-009",
  "timestamp": 9.0,
  "type": "inspect_function",
  "target": {
    "file": "app.py",
    "symbol": "normalize"
  },
  "tool": "open_symbol",
  "observable_input": null,
  "observable_output": null
}
```

Supported event types:

- `search`
- `open_file`
- `symbol_lookup`
- `inspect_function`
- `run_test`
- `backtrack`
- `patch`
- `execute`

## Target Semantics

An event may target:

```json
{
  "file": "app.py",
  "symbol": "normalize",
  "node_id": null
}
```

`node_id` is optional and can be supplied by integrations that already know the corresponding PipeLens program node. Otherwise PipeLens attempts conservative matching by file and symbol.

## Mapping Priority

The current MVP maps each event using the first applicable rule:

1. explicit PipeLens `node_id` → exact, confidence `1.0`;
2. `file + symbol` → exact, confidence `1.0`;
3. unique `symbol` → candidate, confidence `0.85`;
4. `file` → ancestor/file-level mapping, confidence `0.65`.

Unmapped targeted actions are retained in the exploration trace and appear as an **Exploration–Execution Gap** rather than being silently discarded.

## Integration API

External coding-agent adapters can POST a combined program trace and observable events to:

```text
POST /api/couple
```

Request:

```json
{
  "session_id": "my-agent-session",
  "program_nodes": [],
  "agent_events": []
}
```

Response:

```json
{
  "session_id": "my-agent-session",
  "program_nodes": [],
  "agent_events": [],
  "links": []
}
```

This keeps the frontend agent-agnostic: Codex, Claude Code, custom agents, or replayed research traces can all be normalized into the same observable event schema.
