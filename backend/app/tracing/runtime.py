from __future__ import annotations

import inspect
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from types import FrameType
from typing import Callable

from app.models.trace import DisclosureLevel, ProgramNode, RuntimeEvidence


@dataclass
class ActiveCall:
    node_id: str
    start_time: float


class RuntimeTracer:
    """Small function-level tracer for the first PipeLens MVP.

    It captures observable Python call/return/exception events inside a target
    repository root. The tracer intentionally avoids recording hidden model
    reasoning and only stores runtime evidence produced by the program.
    """

    def __init__(self, repository_root: str | Path):
        self.repository_root = Path(repository_root).resolve()
        self.nodes: list[ProgramNode] = []
        self._active: dict[int, ActiveCall] = {}

    def _inside_repository(self, filename: str) -> bool:
        try:
            Path(filename).resolve().relative_to(self.repository_root)
            return True
        except ValueError:
            return False

    @staticmethod
    def _safe_locals(frame: FrameType) -> dict[str, str]:
        values: dict[str, str] = {}
        for key, value in frame.f_locals.items():
            if key.startswith("__"):
                continue
            try:
                rendered = repr(value)
            except Exception:
                rendered = "<unrepresentable>"
            values[key] = rendered[:240]
        return values

    def _trace(self, frame: FrameType, event: str, arg):
        filename = frame.f_code.co_filename
        if not self._inside_repository(filename):
            return self._trace

        frame_key = id(frame)

        if event == "call":
            node_id = f"call-{uuid.uuid4().hex[:10]}"
            source_file = str(Path(filename).resolve().relative_to(self.repository_root))
            node = ProgramNode(
                id=node_id,
                label=frame.f_code.co_name,
                level=DisclosureLevel.function,
                file=source_file,
                start_line=frame.f_code.co_firstlineno,
                runtime=RuntimeEvidence(
                    executed=True,
                    start_time=time.perf_counter(),
                    input_values=self._safe_locals(frame),
                ),
            )
            self.nodes.append(node)
            self._active[frame_key] = ActiveCall(node_id=node_id, start_time=node.runtime.start_time or 0.0)

        elif event in {"return", "exception"}:
            active = self._active.pop(frame_key, None)
            if active is None:
                return self._trace
            node = next((n for n in reversed(self.nodes) if n.id == active.node_id), None)
            if node is None:
                return self._trace
            node.runtime.end_time = time.perf_counter()
            if event == "return":
                node.runtime.output_values = {"return": repr(arg)[:240]}
            else:
                exc_type, exc_value, _ = arg
                node.runtime.exception = f"{exc_type.__name__}: {exc_value}"

        return self._trace

    def run(self, fn: Callable, *args, **kwargs):
        previous = sys.gettrace()
        sys.settrace(self._trace)
        try:
            return fn(*args, **kwargs)
        finally:
            sys.settrace(previous)

    def as_nodes(self) -> list[ProgramNode]:
        return self.nodes
