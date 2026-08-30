from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, computed_field

from app.models.trace import LineRange


class TestSummary(BaseModel):
    passed: int = 0
    failed: int = 0
    total: int = 0
    exit_code: int = 0
    duration_ms: float = 0.0
    failing_tests: list[str] = Field(default_factory=list)


class ExecutionDiff(BaseModel):
    function: str
    before_output: Any = None
    after_output: Any = None
    changed: bool = False


class ScopeViolation(BaseModel):
    file: str
    start: int
    end: int
    reason: str


class VerificationReport(BaseModel):
    selected_node_id: str
    before_tests: TestSummary
    after_tests: TestSummary
    changed_files: list[str] = Field(default_factory=list)
    changed_line_ranges: list[LineRange] = Field(default_factory=list)
    scope_violations: list[ScopeViolation] = Field(default_factory=list)
    execution_diffs: list[ExecutionDiff] = Field(default_factory=list)
    unified_diff: str = ""

    @computed_field
    @property
    def scope_compliant(self) -> bool:
        return not self.scope_violations

    @computed_field
    @property
    def improved(self) -> bool:
        return self.after_tests.passed > self.before_tests.passed and self.after_tests.failed < self.before_tests.failed
