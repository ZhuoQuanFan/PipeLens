from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class StructureKind(str, Enum):
    module = "module"
    class_ = "class"
    function = "function"
    dataflow = "dataflow"
    statement = "statement"


class StructureNode(BaseModel):
    id: str
    label: str
    kind: StructureKind
    file: str
    start_line: int | None = None
    end_line: int | None = None
    source: str | None = None
    children: list["StructureNode"] = Field(default_factory=list)


class AnalyzePythonRequest(BaseModel):
    file: str = "source.py"
    source: str


class PythonStructureResponse(BaseModel):
    root: StructureNode
    classes: int = 0
    functions: int = 0
    statements: int = 0
