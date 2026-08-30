from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class DisclosureLevel(str, Enum):
    behavior = "behavior"
    logic = "logic"
    function = "function"
    dataflow = "dataflow"
    statement = "statement"


class RuntimeEvidence(BaseModel):
    executed: bool = False
    start_time: float | None = None
    end_time: float | None = None
    input_values: dict[str, Any] = Field(default_factory=dict)
    output_values: dict[str, Any] = Field(default_factory=dict)
    exception: str | None = None


class ProgramNode(BaseModel):
    id: str
    label: str
    level: DisclosureLevel
    parent_id: str | None = None
    file: str | None = None
    start_line: int | None = None
    end_line: int | None = None
    children: list[str] = Field(default_factory=list)
    incoming: list[str] = Field(default_factory=list)
    outgoing: list[str] = Field(default_factory=list)
    runtime: RuntimeEvidence = Field(default_factory=RuntimeEvidence)


class AgentEventType(str, Enum):
    search = "search"
    open_file = "open_file"
    symbol_lookup = "symbol_lookup"
    inspect_function = "inspect_function"
    run_test = "run_test"
    backtrack = "backtrack"
    patch = "patch"
    execute = "execute"


class AgentTarget(BaseModel):
    file: str | None = None
    symbol: str | None = None
    node_id: str | None = None


class AgentEvent(BaseModel):
    id: str
    timestamp: float
    type: AgentEventType
    target: AgentTarget | None = None
    tool: str | None = None
    observable_input: Any = None
    observable_output: Any = None


class LinkRelation(str, Enum):
    exact = "exact"
    ancestor = "ancestor"
    dependency = "dependency"
    candidate = "candidate"


class ExecutionExplorationLink(BaseModel):
    execution_node_id: str
    agent_event_id: str
    relation: LinkRelation
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class LineRange(BaseModel):
    file: str
    start: int
    end: int


class ScopeContract(BaseModel):
    selected_node_id: str
    search_node_ids: list[str] = Field(default_factory=list)
    search_files: list[str] = Field(default_factory=list)
    context_node_ids: list[str] = Field(default_factory=list)
    include_runtime_values: bool = True
    include_tests: bool = True
    edit_files: list[str] = Field(default_factory=list)
    edit_line_ranges: list[LineRange] = Field(default_factory=list)


class TraceBundle(BaseModel):
    session_id: str
    program_nodes: list[ProgramNode] = Field(default_factory=list)
    agent_events: list[AgentEvent] = Field(default_factory=list)
    links: list[ExecutionExplorationLink] = Field(default_factory=list)
