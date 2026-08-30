from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, computed_field

from app.models.trace import AgentEvent, ExecutionExplorationLink, LineRange, ProgramNode, ScopeContract, TraceBundle
from app.models.verification import ScopeViolation


class AgentSessionStatus(str, Enum):
    active = "active"
    completed = "completed"


class AgentSessionStartRequest(BaseModel):
    trace: TraceBundle
    scope: ScopeContract
    provider: str = "generic"


class AgentActionRequest(BaseModel):
    event: AgentEvent


class AgentActionDecision(BaseModel):
    event: AgentEvent
    allowed: bool
    reason: str


class CandidatePatchRequest(BaseModel):
    changed_files: list[str] = Field(default_factory=list)
    changed_line_ranges: list[LineRange] = Field(default_factory=list)
    unified_diff: str = ""


class PatchDecision(BaseModel):
    accepted: bool
    changed_files: list[str] = Field(default_factory=list)
    changed_line_ranges: list[LineRange] = Field(default_factory=list)
    scope_violations: list[ScopeViolation] = Field(default_factory=list)
    unified_diff: str = ""


class AgentSession(BaseModel):
    id: str
    provider: str
    source_session_id: str
    status: AgentSessionStatus = AgentSessionStatus.active
    scope: ScopeContract
    program_nodes: list[ProgramNode] = Field(default_factory=list)
    agent_events: list[AgentEvent] = Field(default_factory=list)
    links: list[ExecutionExplorationLink] = Field(default_factory=list)
    action_decisions: list[AgentActionDecision] = Field(default_factory=list)
    patch_decisions: list[PatchDecision] = Field(default_factory=list)

    @computed_field
    @property
    def rejected_actions(self) -> int:
        return sum(1 for item in self.action_decisions if not item.allowed)

    @computed_field
    @property
    def rejected_patches(self) -> int:
        return sum(1 for item in self.patch_decisions if not item.accepted)
