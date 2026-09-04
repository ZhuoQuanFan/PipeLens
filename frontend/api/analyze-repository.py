"""Vercel adapter for PipeLens' source-grounded repository graph.

This stdlib-only adapter mirrors the FastAPI analyzer contract so the browser
can use the same Repository map locally and on a single Vercel deployment.
"""

from __future__ import annotations

import ast
import json
import posixpath
import re
from collections import defaultdict
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import urlparse


MAX_REQUEST_BYTES = 4_000_000
MAX_FILE_BYTES = 1_000_000
MAX_FILES = 1_000
SOURCE_EXTENSIONS = {".py", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"}
JS_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
ENTRYPOINTS = {
    "app.py", "main.py", "server.py", "cli.py", "index.js", "index.jsx",
    "index.ts", "index.tsx", "main.js", "main.ts", "main.tsx",
}
JS_RESERVED_CALLS = {"catch", "for", "if", "new", "return", "switch", "while"}


def _slug(*parts: str) -> str:
    value = "_".join(part.strip("_. ") for part in parts if part.strip("_. "))
    return re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()


def _normalized_path(path: str) -> str:
    normalized = posixpath.normpath(path.replace("\\", "/").lstrip("/"))
    if normalized in {"", ".", ".."} or normalized.startswith("../"):
        raise ValueError(f"Invalid repository-relative path: {path}")
    return normalized


def _language(path: str, hint: str | None = None) -> str:
    if hint:
        return hint.lower()
    suffix = PurePosixPath(path).suffix.lower()
    if suffix == ".py":
        return "python"
    return "typescript" if suffix in {".ts", ".tsx"} else "javascript"


def _module_id(path: str) -> str:
    return f"module:{_slug(path)}"


def _symbol_id(path: str, kind: str, name: str, line: int) -> str:
    return f"symbol:{_slug(path, kind, name)}:{line}"


def _external_id(package: str) -> str:
    return f"external:{_slug(package)}"


def _anchor(file: str, start: int = 1, end: int | None = None, symbol: str | None = None) -> dict[str, Any]:
    return {"file": file, "start_line": start, "end_line": end, "symbol": symbol}


def _module_node(path: str, content: str, language: str) -> dict[str, Any]:
    return {
        "id": _module_id(path),
        "label": path,
        "kind": "module",
        "language": language,
        "anchor": _anchor(path, 1, max(1, len(content.splitlines()))),
        "tags": ["entrypoint"] if PurePosixPath(path).name.lower() in ENTRYPOINTS else [],
    }


def _symbol_node(path: str, language: str, kind: str, name: str, line: int, end: int | None = None) -> dict[str, Any]:
    return {
        "id": _symbol_id(path, kind, name, line),
        "label": f"{name}()" if kind in {"function", "method"} else name,
        "kind": kind,
        "language": language,
        "anchor": _anchor(path, line, end, name),
        "tags": ["source-grounded"],
    }


@dataclass(frozen=True)
class ImportRecord:
    source_file: str
    specifier: str
    line: int
    level: int = 0
    names: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True)
class CallRecord:
    source_file: str
    caller_id: str
    callee: str
    line: int
    class_name: str | None = None


@dataclass
class Fragment:
    nodes: list[dict[str, Any]] = field(default_factory=list)
    contains: list[tuple[str, str, int]] = field(default_factory=list)
    imports: list[ImportRecord] = field(default_factory=list)
    calls: list[CallRecord] = field(default_factory=list)


class PythonCollector(ast.NodeVisitor):
    def __init__(self, path: str, language: str, module: dict[str, Any]):
        self.path = path
        self.language = language
        self.fragment = Fragment(nodes=[module])
        self.scope_stack = [module["id"]]
        self.class_stack: list[str] = []

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            self.fragment.imports.append(ImportRecord(
                self.path,
                alias.name,
                node.lineno,
                names=((alias.name.rsplit(".", 1)[-1], alias.asname or alias.name.split(".", 1)[0]),),
            ))

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        self.fragment.imports.append(ImportRecord(
            self.path,
            node.module or "",
            node.lineno,
            node.level,
            tuple((alias.name, alias.asname or alias.name) for alias in node.names),
        ))

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        name = ".".join([*self.class_stack, node.name])
        graph_node = _symbol_node(self.path, self.language, "class", name, node.lineno, getattr(node, "end_lineno", node.lineno))
        self.fragment.nodes.append(graph_node)
        self.fragment.contains.append((self.scope_stack[-1], graph_node["id"], node.lineno))
        self.class_stack.append(node.name)
        self.scope_stack.append(graph_node["id"])
        self.generic_visit(node)
        self.scope_stack.pop()
        self.class_stack.pop()

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._visit_function(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._visit_function(node)

    def _visit_function(self, node: ast.FunctionDef | ast.AsyncFunctionDef) -> None:
        name = ".".join([*self.class_stack, node.name])
        kind = "method" if self.class_stack else "function"
        graph_node = _symbol_node(self.path, self.language, kind, name, node.lineno, getattr(node, "end_lineno", node.lineno))
        self.fragment.nodes.append(graph_node)
        self.fragment.contains.append((self.scope_stack[-1], graph_node["id"], node.lineno))
        self.scope_stack.append(graph_node["id"])
        self.generic_visit(node)
        self.scope_stack.pop()

    def visit_Call(self, node: ast.Call) -> None:
        callee = self._callee_name(node.func)
        if callee:
            self.fragment.calls.append(CallRecord(
                self.path,
                self.scope_stack[-1],
                callee,
                node.lineno,
                self.class_stack[-1] if self.class_stack else None,
            ))
        self.generic_visit(node)

    @staticmethod
    def _callee_name(node: ast.AST) -> str | None:
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            parts = [node.attr]
            value = node.value
            while isinstance(value, ast.Attribute):
                parts.append(value.attr)
                value = value.value
            if isinstance(value, ast.Name):
                parts.append(value.id)
            return ".".join(reversed(parts))
        return None


def _js_import_names(clause: str) -> tuple[tuple[str, str], ...]:
    names: list[tuple[str, str]] = []
    braces = re.search(r"\{([^}]+)\}", clause)
    if braces:
        for item in braces.group(1).split(","):
            parts = [part.strip() for part in re.split(r"\s+as\s+", item.strip()) if part.strip()]
            if parts:
                names.append((parts[0], parts[-1]))
    namespace = re.search(r"\*\s+as\s+([A-Za-z_$][\w$]*)", clause)
    if namespace:
        names.append(("*", namespace.group(1)))
    default = re.match(r"([A-Za-z_$][\w$]*)", clause.strip())
    if default and not clause.strip().startswith("{"):
        names.append(("default", default.group(1)))
    return tuple(names)


def _extract_javascript(path: str, content: str, language: str, module: dict[str, Any]) -> Fragment:
    fragment = Fragment(nodes=[module])
    scope_stack: list[tuple[str, int, str | None]] = [(module["id"], -1, None)]
    class_stack: list[tuple[str, str, int]] = []
    brace_depth = 0
    imports = re.compile(r"(?:import|export)\s+(.+?)\s+from\s+['\"]([^'\"]+)['\"]|require\(\s*['\"]([^'\"]+)['\"]\s*\)")
    side_effect = re.compile(r"^\s*import\s+['\"]([^'\"]+)['\"]")
    classes = re.compile(r"^\s*(?:export\s+(?:default\s+)?)?class\s+([A-Za-z_$][\w$]*)")
    functions = re.compile(r"^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(")
    arrows = re.compile(r"^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>")
    methods = re.compile(r"^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\(")
    calls = re.compile(r"\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(")

    for line_number, line in enumerate(content.splitlines(), start=1):
        stripped = line.strip()
        opening, closing = line.count("{"), line.count("}")
        call_scope = scope_stack[-1]
        imported = imports.search(line)
        side = side_effect.search(line)
        if imported:
            clause = imported.group(1) or ""
            specifier = imported.group(2) or imported.group(3) or ""
            fragment.imports.append(ImportRecord(path, specifier, line_number, names=_js_import_names(clause)))
        elif side:
            fragment.imports.append(ImportRecord(path, side.group(1), line_number))

        class_match = classes.match(line)
        if class_match:
            name = class_match.group(1)
            graph_node = _symbol_node(path, language, "class", name, line_number)
            fragment.nodes.append(graph_node)
            fragment.contains.append((scope_stack[-1][0], graph_node["id"], line_number))
            if opening:
                class_stack.append((name, graph_node["id"], brace_depth + opening))
                scope_stack.append((graph_node["id"], brace_depth + opening, name))

        function_match = functions.match(line) or arrows.match(line)
        if function_match:
            name = function_match.group(1)
            graph_node = _symbol_node(path, language, "function", name, line_number)
            fragment.nodes.append(graph_node)
            fragment.contains.append((module["id"], graph_node["id"], line_number))
            call_scope = (graph_node["id"], brace_depth + opening, None)
            if opening:
                scope_stack.append(call_scope)

        method_match = methods.match(line) if class_stack else None
        if method_match and not stripped.startswith(("if ", "for ", "while ", "switch ", "catch ", "function ")):
            method_name = method_match.group(1)
            if method_name != "constructor":
                class_name, class_id, _ = class_stack[-1]
                name = f"{class_name}.{method_name}"
                graph_node = _symbol_node(path, language, "method", name, line_number)
                fragment.nodes.append(graph_node)
                fragment.contains.append((class_id, graph_node["id"], line_number))
                call_scope = (graph_node["id"], brace_depth + opening, class_name)
                if opening:
                    scope_stack.append(call_scope)

        if not imported and not stripped.startswith(("function ", "class ", "export function", "export class")):
            for match in calls.finditer(line):
                callee = match.group(1)
                if callee.rsplit(".", 1)[-1] not in JS_RESERVED_CALLS:
                    fragment.calls.append(CallRecord(path, call_scope[0], callee, line_number, call_scope[2]))

        brace_depth += opening - closing
        while len(scope_stack) > 1 and brace_depth < scope_stack[-1][1]:
            scope_stack.pop()
        while class_stack and brace_depth < class_stack[-1][2]:
            class_stack.pop()
    return fragment


def _resolve_import(record: ImportRecord, inventory: set[str]) -> str | None:
    if record.source_file.endswith(".py"):
        parts = [part for part in record.specifier.split(".") if part]
        if record.level:
            base = PurePosixPath(record.source_file).parent
            for _ in range(max(0, record.level - 1)):
                base = base.parent
            stems = [base.joinpath(*parts).as_posix()] if parts else [
                base.joinpath(name).as_posix() for name, _ in record.names if name != "*"
            ]
        else:
            stems = ["/".join(parts)]
        candidates = [candidate for stem in stems if stem for candidate in (f"{stem}.py", f"{stem}/__init__.py")]
        if record.level == 0:
            initial = list(candidates)
            parents = list(PurePosixPath(record.source_file).parent.parts)
            for depth in range(len(parents), -1, -1):
                prefix = "/".join(parents[:depth])
                candidates.extend(f"{prefix}/{candidate}" if prefix else candidate for candidate in initial)
        return next((candidate for candidate in candidates if candidate in inventory), None)

    if not record.specifier.startswith("."):
        return None
    base = posixpath.normpath(posixpath.join(posixpath.dirname(record.source_file), record.specifier))
    candidates = [base] if PurePosixPath(base).suffix else []
    candidates.extend(f"{base}{suffix}" for suffix in JS_EXTENSIONS)
    candidates.extend(f"{base}/index{suffix}" for suffix in JS_EXTENSIONS)
    return next((candidate for candidate in candidates if candidate in inventory), None)


def _package_name(specifier: str) -> str:
    cleaned = specifier.lstrip(".") or "unresolved"
    if cleaned.startswith("@"):
        return "/".join(cleaned.split("/")[:2])
    return cleaned.split("/", 1)[0].split(".", 1)[0]


def _add_edge(edges: dict[tuple[str, str, str, int], dict[str, Any]], source: str, target: str, relation: str, confidence: str, anchor: dict[str, Any]) -> None:
    key = (source, target, relation, anchor["start_line"])
    edges.setdefault(key, {
        "id": f"edge:{_slug(source, relation, target, str(anchor['start_line']))}",
        "source": source,
        "target": target,
        "relation": relation,
        "confidence": confidence,
        "anchor": anchor,
    })


def analyze_repository(files: list[dict[str, Any]]) -> dict[str, Any]:
    warnings: list[str] = []
    sources: dict[str, dict[str, Any]] = {}
    for item in files[:MAX_FILES]:
        raw_path, content = item.get("path"), item.get("content")
        if not isinstance(raw_path, str) or not isinstance(content, str):
            warnings.append("Ignored a workspace entry without string path/content.")
            continue
        if len(content.encode("utf-8")) > MAX_FILE_BYTES:
            warnings.append(f"File is too large and was ignored: {raw_path}")
            continue
        try:
            path = _normalized_path(raw_path)
        except ValueError as exc:
            warnings.append(str(exc))
            continue
        if PurePosixPath(path).suffix.lower() not in SOURCE_EXTENSIONS:
            continue
        if path in sources:
            warnings.append(f"Duplicate path ignored: {path}")
            continue
        sources[path] = {"path": path, "content": content, "language": item.get("language")}
    if len(files) > MAX_FILES:
        warnings.append(f"Only the first {MAX_FILES} files were analyzed.")

    root = {"id": "repository:root", "label": "Repository", "kind": "repository", "language": None, "anchor": None, "tags": ["architecture-root"]}
    fragments: dict[str, Fragment] = {}
    for path in sorted(sources):
        item = sources[path]
        language = _language(path, item.get("language"))
        module = _module_node(path, item["content"], language)
        try:
            if path.endswith(".py"):
                collector = PythonCollector(path, language, module)
                collector.visit(ast.parse(item["content"], filename=path))
                fragments[path] = collector.fragment
            else:
                fragments[path] = _extract_javascript(path, item["content"], language, module)
        except SyntaxError as exc:
            warnings.append(f"{path}:{exc.lineno or 1}: {exc.msg}")
            fragments[path] = Fragment(nodes=[module])

    nodes = {root["id"]: root}
    edges: dict[tuple[str, str, str, int], dict[str, Any]] = {}
    symbols_by_file: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    symbols_by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for path, fragment in fragments.items():
        for node in fragment.nodes:
            nodes.setdefault(node["id"], node)
            if node["kind"] not in {"repository", "module", "external"}:
                symbol = node["anchor"]["symbol"]
                symbols_by_file[path].setdefault(node["label"].removesuffix("()"), node)
                symbols_by_file[path].setdefault(symbol, node)
                symbols_by_file[path].setdefault(symbol.rsplit(".", 1)[-1], node)
                symbols_by_name[symbol.rsplit(".", 1)[-1]].append(node)
        module = next(node for node in fragment.nodes if node["kind"] == "module")
        _add_edge(edges, root["id"], module["id"], "contains", "extracted", _anchor(path))
        for source, target, line in fragment.contains:
            _add_edge(edges, source, target, "contains", "extracted", _anchor(path, line))

    aliases: dict[str, dict[str, str]] = defaultdict(dict)
    inventory = set(sources)
    for path, fragment in fragments.items():
        for record in fragment.imports:
            target_path = _resolve_import(record, inventory)
            if target_path:
                target_id, confidence = _module_id(target_path), "inferred"
                if record.names:
                    for imported, alias in record.names:
                        target = symbols_by_file[target_path].get(imported)
                        aliases[path][alias] = target["id"] if target else target_id
                else:
                    aliases[path][record.specifier.rsplit(".", 1)[-1]] = target_id
            else:
                package = _package_name(record.specifier)
                target_id = _external_id(package)
                confidence = "extracted" if record.level == 0 else "ambiguous"
                nodes.setdefault(target_id, {"id": target_id, "label": package, "kind": "external", "language": None, "anchor": None, "tags": ["external-dependency"]})
                if record.names:
                    for _, alias in record.names:
                        aliases[path][alias] = target_id
                else:
                    aliases[path][record.specifier.rsplit("/", 1)[-1].rsplit(".", 1)[-1]] = target_id
            _add_edge(edges, _module_id(path), target_id, "imports", confidence, _anchor(path, record.line))

    for path, fragment in fragments.items():
        for record in fragment.calls:
            local, callee = symbols_by_file[path], record.callee
            leaf = callee.rsplit(".", 1)[-1]
            target: str | None = None
            confidence = "ambiguous"
            if callee.startswith("self.") and record.class_name:
                found = local.get(f"{record.class_name}.{leaf}") or local.get(leaf)
                if found:
                    target, confidence = found["id"], "inferred"
            if target is None and callee in aliases[path]:
                target, confidence = aliases[path][callee], "inferred"
            if target is None and "." in callee:
                alias_root, member = callee.split(".", 1)
                aliased = aliases[path].get(alias_root)
                if aliased and aliased.startswith("module:"):
                    target_file = next((candidate for candidate in symbols_by_file if _module_id(candidate) == aliased), None)
                    found = symbols_by_file[target_file].get(member) if target_file else None
                    target, confidence = (found["id"] if found else aliased), "inferred"
                elif aliased:
                    target, confidence = aliased, "ambiguous"
            if target is None:
                found = local.get(callee) or local.get(leaf)
                if found:
                    target, confidence = found["id"], "inferred"
            if target is None and len(symbols_by_name.get(leaf, [])) == 1:
                target = symbols_by_name[leaf][0]["id"]
            if target and target != record.caller_id:
                _add_edge(edges, record.caller_id, target, "calls", confidence, _anchor(path, record.line, symbol=callee))

    rank = {"repository": 0, "module": 1, "class": 2, "function": 3, "method": 4, "external": 5}
    ordered_nodes = sorted(nodes.values(), key=lambda node: (rank[node["kind"]], node["label"].lower(), node["id"]))
    ordered_edges = sorted(edges.values(), key=lambda edge: (edge["relation"], edge["source"], edge["target"], edge["id"]))
    return {
        "schema_version": 1,
        "root_id": "repository:root",
        "nodes": ordered_nodes,
        "edges": ordered_edges,
        "summary": {
            "files": sum(node["kind"] == "module" for node in ordered_nodes),
            "symbols": sum(node["kind"] in {"class", "function", "method"} for node in ordered_nodes),
            "imports": sum(edge["relation"] == "imports" for edge in ordered_edges),
            "calls": sum(edge["relation"] == "calls" for edge in ordered_edges),
            "external_dependencies": sum(node["kind"] == "external" for node in ordered_nodes),
        },
        "warnings": warnings,
    }


def _allowed_origin(origin: str | None) -> bool:
    if not origin:
        return True
    parsed = urlparse(origin)
    hostname = parsed.hostname or ""
    return (
        parsed.scheme == "http" and hostname in {"localhost", "127.0.0.1"}
    ) or (
        parsed.scheme == "https"
        and (
            hostname == "pipelens-latest.vercel.app"
            or hostname.startswith("pipelens-latest-") and hostname.endswith(".vercel.app")
        )
    )


class handler(BaseHTTPRequestHandler):
    def _json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin")
        if origin and _allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if not _allowed_origin(self.headers.get("Origin")):
            self._json(403, {"error": "Origin not allowed"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_REQUEST_BYTES:
                raise ValueError("Invalid repository request size.")
            payload = json.loads(self.rfile.read(length))
            files = payload.get("files")
            if not isinstance(files, list):
                raise ValueError("files must be an array.")
            self._json(200, analyze_repository(files))
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            self._json(400, {"error": str(exc)})

    def do_OPTIONS(self) -> None:
        origin = self.headers.get("Origin")
        if origin and not _allowed_origin(origin):
            self._json(403, {"error": "Origin not allowed"})
            return
        self.send_response(204)
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
