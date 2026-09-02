from __future__ import annotations

import ast
import json
import math
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler
from types import FrameType
from typing import Any
from urllib.parse import urlparse

MAX_SOURCE_BYTES = 800_000
ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://pipelens-latest.vercel.app",
}


class TraceTensor:
    def __init__(self, value: float, last_size: int = 4):
        self.value = float(value)
        self.last_size = last_size

    def transpose(self, _left: int, _right: int) -> "TraceTensor":
        return self

    def size(self, dimension: int) -> int:
        if dimension != -1:
            raise ValueError("The verification harness only exposes the final tensor dimension.")
        return self.last_size

    def __matmul__(self, other: "TraceTensor") -> "TraceTensor":
        return TraceTensor(self.value * other.value, other.last_size)

    def __mul__(self, other: Any) -> "TraceTensor":
        value = other.value if isinstance(other, TraceTensor) else other
        return TraceTensor(self.value * float(value), self.last_size)

    __rmul__ = __mul__

    def __truediv__(self, other: Any) -> "TraceTensor":
        value = other.value if isinstance(other, TraceTensor) else other
        return TraceTensor(self.value / float(value), self.last_size)


class SafeStatement(ast.NodeVisitor):
    allowed_nodes = {
        ast.Module, ast.Assign, ast.Name, ast.Store, ast.Load, ast.BinOp,
        ast.MatMult, ast.Mult, ast.Div, ast.Pow, ast.Add, ast.Sub,
        ast.UnaryOp, ast.USub, ast.UAdd, ast.Call, ast.Attribute,
        ast.Constant, ast.Expr,
    }
    allowed_names = {"att", "q", "k", "math"}
    allowed_calls = {("math", "sqrt"), ("k", "transpose"), ("k", "size"), ("q", "transpose"), ("q", "size")}

    def generic_visit(self, node: ast.AST) -> None:
        if type(node) not in self.allowed_nodes:
            raise ValueError(f"Unsupported Python operation: {type(node).__name__}")
        super().generic_visit(node)

    def visit_Name(self, node: ast.Name) -> None:
        if node.id not in self.allowed_names:
            raise ValueError(f"Name {node.id!r} is not available in the verification harness.")

    def visit_Assign(self, node: ast.Assign) -> None:
        if len(node.targets) != 1 or not isinstance(node.targets[0], ast.Name) or node.targets[0].id != "att":
            raise ValueError("The selected statement must assign its result to att.")
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        if not isinstance(node.func, ast.Attribute) or not isinstance(node.func.value, ast.Name):
            raise ValueError("Only the attention verification helpers may be called.")
        if (node.func.value.id, node.func.attr) not in self.allowed_calls or node.keywords:
            raise ValueError("The selected call is outside the safe verification harness.")
        self.generic_visit(node)

    def visit_Constant(self, node: ast.Constant) -> None:
        if not isinstance(node.value, (int, float)) or abs(node.value) > 10_000:
            raise ValueError("The verification harness only accepts bounded numeric constants.")

    def visit_BinOp(self, node: ast.BinOp) -> None:
        if isinstance(node.op, ast.Pow) and isinstance(node.right, ast.Constant) and isinstance(node.right.value, (int, float)) and abs(node.right.value) > 8:
            raise ValueError("The exponent is too large for the verification harness.")
        self.generic_visit(node)


def allowed_origin(origin: str | None) -> bool:
    if not origin or origin in ALLOWED_ORIGINS:
        return True
    hostname = urlparse(origin).hostname or ""
    return hostname.startswith("pipelens-latest-") and hostname.endswith(".vercel.app")


def verify_payload(payload: dict[str, Any]) -> dict[str, Any]:
    source = payload.get("source")
    file_name = payload.get("file")
    node_id = payload.get("nodeId")
    line = payload.get("line")
    if not isinstance(source, str) or not isinstance(file_name, str) or not isinstance(node_id, str) or not isinstance(line, int):
        raise ValueError("source, file, nodeId and line are required.")
    if len(source.encode("utf-8")) > MAX_SOURCE_BYTES:
        raise ValueError("The Python source is too large to verify.")
    if line < 1 or line > len(source.splitlines()):
        raise ValueError("The selected source line does not exist.")

    selected = source.splitlines()[line - 1].strip()
    if len(selected) > 2_000:
        raise ValueError("The selected Python statement is too large to verify.")
    tree = ast.parse(selected, filename=file_name, mode="exec")
    SafeStatement().visit(tree)
    ast.increment_lineno(tree, line - 1)
    compiled = compile(tree, file_name, "exec")
    trace: list[dict[str, Any]] = []

    def record(frame: FrameType, event: str, arg: Any):
        if frame.f_code.co_filename == file_name and event in {"line", "exception"}:
            trace.append({
                "file": file_name,
                "line": frame.f_lineno,
                "event": "exception" if event == "exception" else "line",
                "status": "fault" if event == "exception" else "healthy",
            })
        return record

    locals_map: dict[str, Any] = {"q": TraceTensor(4.0), "k": TraceTensor(2.0, last_size=4)}
    started = time.perf_counter()
    try:
        previous = sys.gettrace()
        sys.settrace(record)
        try:
            exec(compiled, {"__builtins__": {}, "math": math}, locals_map)
        finally:
            sys.settrace(previous)
        result = locals_map.get("att")
        if not isinstance(result, TraceTensor):
            raise ValueError("The selected statement did not produce an attention tensor.")
        actual = result.value
        expected = 4.0
        passed = math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-9)
        trace.append({
            "file": file_name,
            "line": line,
            "event": "assertion",
            "status": "healthy" if passed else "fault",
            "value": f"attention={actual:g}; expected={expected:g}",
        })
        return {
            "runId": f"py-{uuid.uuid4().hex[:12]}",
            "status": "passed" if passed else "failed",
            "summary": "Python execution passed; the attention scale is correct." if passed else "Python execution reproduced the attention scaling fault.",
            "file": file_name,
            "nodeId": node_id,
            "line": line,
            "durationMs": round((time.perf_counter() - started) * 1000, 2),
            "expected": expected,
            "actual": actual,
            "trace": trace,
        }
    except Exception as exc:
        trace.append({"file": file_name, "line": line, "event": "exception", "status": "fault", "value": f"{type(exc).__name__}: {exc}"})
        return {
            "runId": f"py-{uuid.uuid4().hex[:12]}",
            "status": "error",
            "summary": f"Python execution failed: {type(exc).__name__}: {exc}",
            "file": file_name,
            "nodeId": node_id,
            "line": line,
            "durationMs": round((time.perf_counter() - started) * 1000, 2),
            "trace": trace,
        }


class handler(BaseHTTPRequestHandler):
    def _json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        origin = self.headers.get("Origin")
        if not allowed_origin(origin):
            self._json(403, {"error": "Origin not allowed"})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > MAX_SOURCE_BYTES + 20_000:
                raise ValueError("Invalid request size.")
            payload = json.loads(self.rfile.read(content_length))
            self._json(200, verify_payload(payload))
        except (ValueError, SyntaxError, json.JSONDecodeError) as exc:
            self._json(400, {"error": str(exc)})

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()
