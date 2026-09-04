from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class RepositoryFile(BaseModel):
    path: str = Field(min_length=1)
    content: str = Field(max_length=1_000_000)
    language: str | None = None


class AnalyzeRepositoryRequest(BaseModel):
    files: list[RepositoryFile] = Field(default_factory=list, max_length=1_000)


class GraphNodeKind(str, Enum):
    repository = "repository"
    module = "module"
    class_ = "class"
    function = "function"
    method = "method"
    external = "external"


class GraphRelation(str, Enum):
    contains = "contains"
    imports = "imports"
    calls = "calls"


class GraphConfidence(str, Enum):
    extracted = "extracted"
    inferred = "inferred"
    ambiguous = "ambiguous"


class SourceAnchor(BaseModel):
    file: str
    start_line: int = Field(default=1, ge=1)
    end_line: int | None = Field(default=None, ge=1)
    symbol: str | None = None


class RepositoryGraphNode(BaseModel):
    id: str
    label: str
    kind: GraphNodeKind
    language: str | None = None
    anchor: SourceAnchor | None = None
    tags: list[str] = Field(default_factory=list)


class RepositoryGraphEdge(BaseModel):
    id: str
    source: str
    target: str
    relation: GraphRelation
    confidence: GraphConfidence
    anchor: SourceAnchor | None = None


class RepositoryGraphSummary(BaseModel):
    files: int = 0
    symbols: int = 0
    imports: int = 0
    calls: int = 0
    external_dependencies: int = 0


class RepositoryGraphResponse(BaseModel):
    schema_version: int = 1
    root_id: str = "repository:root"
    nodes: list[RepositoryGraphNode] = Field(default_factory=list)
    edges: list[RepositoryGraphEdge] = Field(default_factory=list)
    summary: RepositoryGraphSummary = Field(default_factory=RepositoryGraphSummary)
    warnings: list[str] = Field(default_factory=list)
