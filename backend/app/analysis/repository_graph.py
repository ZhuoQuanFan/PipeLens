"""Repository graph extraction adapted for PipeLens.

The extraction stages and confidence vocabulary are based on the MIT-licensed
Aryan1718/Archify repository graph engine (commit 2e711ee). PipeLens keeps the
result in its own compact API model so the existing PipeWorld renderer remains
the visualization owner.
"""

from __future__ import annotations

import ast
import posixpath
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import PurePosixPath

from app.models.repository_graph import (
    GraphConfidence,
    GraphNodeKind,
    GraphRelation,
    RepositoryFile,
    RepositoryGraphEdge,
    RepositoryGraphNode,
    RepositoryGraphResponse,
    RepositoryGraphSummary,
    SourceAnchor,
)


_SOURCE_EXTENSIONS = {".py", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"}
_JS_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
_ENTRYPOINT_NAMES = {
    "app.py",
    "main.py",
    "server.py",
    "cli.py",
    "index.js",
    "index.jsx",
    "index.ts",
    "index.tsx",
    "main.js",
    "main.ts",
    "main.tsx",
}
_JS_RESERVED_CALLS = {
    "catch",
    "for",
    "if",
    "new",
    "return",
    "switch",
    "while",
}


def _slug(*parts: str) -> str:
    value = "_".join(part.strip("_. ") for part in parts if part.strip("_. "))
    return re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()


def _normalized_path(path: str) -> str:
    normalized = posixpath.normpath(path.replace("\\", "/").lstrip("/"))
    if normalized in {"", "."} or normalized == ".." or normalized.startswith("../"):
        raise ValueError(f"Invalid repository-relative path: {path}")
    return normalized


def _language_for(path: str, hint: str | None = None) -> str:
    if hint:
        return hint.lower()
    suffix = PurePosixPath(path).suffix.lower()
    if suffix == ".py":
        return "python"
    if suffix in {".ts", ".tsx"}:
        return "typescript"
    return "javascript"


def _module_id(path: str) -> str:
    return f"module:{_slug(path)}"


def _symbol_id(path: str, kind: str, qualname: str, line: int) -> str:
    return f"symbol:{_slug(path, kind, qualname)}:{line}"


def _external_id(package: str) -> str:
    return f"external:{_slug(package)}"


@dataclass(frozen=True)
class _ImportRecord:
    source_file: str
    specifier: str
    line: int
    level: int = 0
    names: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True)
class _CallRecord:
    source_file: str
    caller_id: str
    callee: str
    line: int
    class_name: str | None = None


@dataclass
class _Fragment:
    nodes: list[RepositoryGraphNode] = field(default_factory=list)
    contains: list[tuple[str, str, int]] = field(default_factory=list)
    imports: list[_ImportRecord] = field(default_factory=list)
    calls: list[_CallRecord] = field(default_factory=list)


class RepositoryGraphAnalyzer:
    """Extract modules, symbols, imports and calls from an in-memory workspace."""

    def analyze(self, files: list[RepositoryFile]) -> RepositoryGraphResponse:
        warnings: list[str] = []
        sources: dict[str, RepositoryFile] = {}
        for item in files:
            try:
                path = _normalized_path(item.path)
            except ValueError as exc:
                warnings.append(str(exc))
                continue
            if PurePosixPath(path).suffix.lower() not in _SOURCE_EXTENSIONS:
                continue
            if path in sources:
                warnings.append(f"Duplicate path ignored: {path}")
                continue
            sources[path] = RepositoryFile(path=path, content=item.content, language=item.language)

        root = RepositoryGraphNode(
            id="repository:root",
            label="Repository",
            kind=GraphNodeKind.repository,
            tags=["architecture-root"],
        )
        fragments: dict[str, _Fragment] = {}
        for path in sorted(sources):
            item = sources[path]
            language = _language_for(path, item.language)
            module = RepositoryGraphNode(
                id=_module_id(path),
                label=path,
                kind=GraphNodeKind.module,
                language=language,
                anchor=SourceAnchor(file=path, start_line=1, end_line=max(1, len(item.content.splitlines()))),
                tags=["entrypoint"] if PurePosixPath(path).name.lower() in _ENTRYPOINT_NAMES else [],
            )
            try:
                fragment = (
                    self._extract_python(item, module)
                    if PurePosixPath(path).suffix.lower() == ".py"
                    else self._extract_javascript(item, module)
                )
            except SyntaxError as exc:
                warnings.append(f"{path}:{exc.lineno or 1}: {exc.msg}")
                fragment = _Fragment(nodes=[module])
            fragments[path] = fragment

        nodes: dict[str, RepositoryGraphNode] = {root.id: root}
        edges: dict[tuple[str, str, str, int], RepositoryGraphEdge] = {}
        symbols_by_file: dict[str, dict[str, RepositoryGraphNode]] = defaultdict(dict)
        symbols_by_name: dict[str, list[RepositoryGraphNode]] = defaultdict(list)

        for path, fragment in fragments.items():
            for node in fragment.nodes:
                nodes.setdefault(node.id, node)
                if node.kind not in {GraphNodeKind.repository, GraphNodeKind.module, GraphNodeKind.external}:
                    symbols_by_file[path].setdefault(node.label.removesuffix("()"), node)
                    symbol = node.anchor.symbol if node.anchor else node.label.removesuffix("()")
                    symbols_by_file[path].setdefault(symbol, node)
                    symbols_by_file[path].setdefault(symbol.rsplit(".", 1)[-1], node)
                    symbols_by_name[symbol.rsplit(".", 1)[-1]].append(node)

            module = next(node for node in fragment.nodes if node.kind == GraphNodeKind.module)
            self._add_edge(
                edges,
                root.id,
                module.id,
                GraphRelation.contains,
                GraphConfidence.extracted,
                SourceAnchor(file=path),
            )
            for source, target, line in fragment.contains:
                self._add_edge(
                    edges,
                    source,
                    target,
                    GraphRelation.contains,
                    GraphConfidence.extracted,
                    SourceAnchor(file=path, start_line=line),
                )

        aliases: dict[str, dict[str, str]] = defaultdict(dict)
        for path, fragment in fragments.items():
            for record in fragment.imports:
                target_path = self._resolve_import(record, set(sources))
                if target_path:
                    target_id = _module_id(target_path)
                    confidence = GraphConfidence.inferred
                    self._bind_import_aliases(record, target_path, target_id, symbols_by_file, aliases[path])
                else:
                    package = self._package_name(record.specifier)
                    target_id = _external_id(package)
                    confidence = GraphConfidence.extracted if record.level == 0 else GraphConfidence.ambiguous
                    nodes.setdefault(
                        target_id,
                        RepositoryGraphNode(
                            id=target_id,
                            label=package,
                            kind=GraphNodeKind.external,
                            tags=["external-dependency"],
                        ),
                    )
                    self._bind_external_aliases(record, target_id, aliases[path])
                self._add_edge(
                    edges,
                    _module_id(path),
                    target_id,
                    GraphRelation.imports,
                    confidence,
                    SourceAnchor(file=path, start_line=record.line),
                )

        for path, fragment in fragments.items():
            for record in fragment.calls:
                target, confidence = self._resolve_call(
                    record,
                    aliases[path],
                    symbols_by_file,
                    symbols_by_name,
                )
                if target is None or target == record.caller_id:
                    continue
                self._add_edge(
                    edges,
                    record.caller_id,
                    target,
                    GraphRelation.calls,
                    confidence,
                    SourceAnchor(file=path, start_line=record.line, symbol=record.callee),
                )

        ordered_nodes = sorted(nodes.values(), key=lambda node: (self._kind_rank(node.kind), node.label.lower(), node.id))
        ordered_edges = sorted(edges.values(), key=lambda edge: (edge.relation.value, edge.source, edge.target, edge.id))
        return RepositoryGraphResponse(
            nodes=ordered_nodes,
            edges=ordered_edges,
            summary=RepositoryGraphSummary(
                files=sum(node.kind == GraphNodeKind.module for node in ordered_nodes),
                symbols=sum(node.kind in {GraphNodeKind.class_, GraphNodeKind.function, GraphNodeKind.method} for node in ordered_nodes),
                imports=sum(edge.relation == GraphRelation.imports for edge in ordered_edges),
                calls=sum(edge.relation == GraphRelation.calls for edge in ordered_edges),
                external_dependencies=sum(node.kind == GraphNodeKind.external for node in ordered_nodes),
            ),
            warnings=warnings,
        )

    def _extract_python(self, item: RepositoryFile, module: RepositoryGraphNode) -> _Fragment:
        tree = ast.parse(item.content, filename=item.path)
        collector = _PythonCollector(item.path, item.content, _language_for(item.path, item.language), module)
        collector.visit(tree)
        return collector.fragment

    def _extract_javascript(self, item: RepositoryFile, module: RepositoryGraphNode) -> _Fragment:
        language = _language_for(item.path, item.language)
        fragment = _Fragment(nodes=[module])
        module_id = module.id
        scope_stack: list[tuple[str, int, str | None]] = [(module_id, -1, None)]
        class_stack: list[tuple[str, str, int]] = []
        brace_depth = 0

        import_pattern = re.compile(r"(?:import|export)\s+(.+?)\s+from\s+['\"]([^'\"]+)['\"]|require\(\s*['\"]([^'\"]+)['\"]\s*\)")
        side_effect_import = re.compile(r"^\s*import\s+['\"]([^'\"]+)['\"]")
        class_pattern = re.compile(r"^\s*(?:export\s+(?:default\s+)?)?class\s+([A-Za-z_$][\w$]*)")
        function_pattern = re.compile(r"^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(")
        arrow_pattern = re.compile(r"^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>")
        method_pattern = re.compile(r"^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\(")
        call_pattern = re.compile(r"\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(")

        for line_number, line in enumerate(item.content.splitlines(), start=1):
            stripped = line.strip()
            opening = line.count("{")
            closing = line.count("}")
            call_scope = scope_stack[-1]

            import_match = import_pattern.search(line)
            side_effect_match = side_effect_import.search(line)
            if import_match:
                clause = import_match.group(1) or ""
                specifier = import_match.group(2) or import_match.group(3) or ""
                fragment.imports.append(_ImportRecord(item.path, specifier, line_number, names=self._js_import_names(clause)))
            elif side_effect_match:
                fragment.imports.append(_ImportRecord(item.path, side_effect_match.group(1), line_number))

            class_match = class_pattern.match(line)
            if class_match:
                name = class_match.group(1)
                node = self._symbol_node(item.path, language, "class", name, line_number, line)
                fragment.nodes.append(node)
                fragment.contains.append((scope_stack[-1][0], node.id, line_number))
                if opening:
                    class_stack.append((name, node.id, brace_depth + opening))
                    scope_stack.append((node.id, brace_depth + opening, name))

            function_match = function_pattern.match(line) or arrow_pattern.match(line)
            if function_match:
                name = function_match.group(1)
                node = self._symbol_node(item.path, language, "function", name, line_number, line)
                fragment.nodes.append(node)
                fragment.contains.append((module_id, node.id, line_number))
                call_scope = (node.id, call_scope[1], None)
                if opening:
                    scope_stack.append((node.id, brace_depth + opening, None))

            method_match = method_pattern.match(line) if class_stack else None
            if method_match and not stripped.startswith(("if ", "for ", "while ", "switch ", "catch ", "function ")):
                method_name = method_match.group(1)
                if method_name != "constructor":
                    class_name, class_id, _ = class_stack[-1]
                    qualname = f"{class_name}.{method_name}"
                    node = self._symbol_node(item.path, language, "method", qualname, line_number, line)
                    fragment.nodes.append(node)
                    fragment.contains.append((class_id, node.id, line_number))
                    call_scope = (node.id, call_scope[1], class_name)
                    if opening:
                        scope_stack.append((node.id, brace_depth + opening, class_name))

            if not import_match and not stripped.startswith(("function ", "class ", "export function", "export class")):
                for match in call_pattern.finditer(line):
                    callee = match.group(1)
                    if callee.rsplit(".", 1)[-1] in _JS_RESERVED_CALLS:
                        continue
                    fragment.calls.append(_CallRecord(item.path, call_scope[0], callee, line_number, call_scope[2]))

            brace_depth += opening - closing
            while len(scope_stack) > 1 and brace_depth < scope_stack[-1][1]:
                scope_stack.pop()
            while class_stack and brace_depth < class_stack[-1][2]:
                class_stack.pop()

        return fragment

    @staticmethod
    def _symbol_node(
        path: str,
        language: str,
        kind: str,
        qualname: str,
        line: int,
        source: str,
        end_line: int | None = None,
    ) -> RepositoryGraphNode:
        kind_value = {
            "class": GraphNodeKind.class_,
            "function": GraphNodeKind.function,
            "method": GraphNodeKind.method,
        }[kind]
        return RepositoryGraphNode(
            id=_symbol_id(path, kind, qualname, line),
            label=f"{qualname}()" if kind in {"function", "method"} else qualname,
            kind=kind_value,
            language=language,
            anchor=SourceAnchor(file=path, start_line=line, end_line=end_line, symbol=qualname),
            tags=["source-grounded", source.strip()[:120]],
        )

    @staticmethod
    def _resolve_import(record: _ImportRecord, inventory: set[str]) -> str | None:
        specifier = record.specifier
        if record.source_file.endswith(".py"):
            module_parts = [part for part in specifier.split(".") if part]
            if record.level:
                base = PurePosixPath(record.source_file).parent
                for _ in range(max(0, record.level - 1)):
                    base = base.parent
                stem = base.joinpath(*module_parts).as_posix()
            else:
                stem = "/".join(module_parts)
            candidates = [f"{stem}.py", f"{stem}/__init__.py"] if stem else []
            if record.level == 0:
                parent_parts = list(PurePosixPath(record.source_file).parent.parts)
                for depth in range(len(parent_parts), -1, -1):
                    prefix = "/".join(parent_parts[:depth])
                    candidates.extend(f"{prefix}/{candidate}" if prefix else candidate for candidate in list(candidates[:2]))
            return next((candidate for candidate in candidates if candidate in inventory), None)

        if not specifier.startswith("."):
            return None
        base = posixpath.normpath(posixpath.join(posixpath.dirname(record.source_file), specifier))
        candidates = [base] if PurePosixPath(base).suffix else []
        candidates.extend(f"{base}{suffix}" for suffix in _JS_EXTENSIONS)
        candidates.extend(f"{base}/index{suffix}" for suffix in _JS_EXTENSIONS)
        return next((candidate for candidate in candidates if candidate in inventory), None)

    @staticmethod
    def _package_name(specifier: str) -> str:
        cleaned = specifier.lstrip(".") or "unresolved"
        if cleaned.startswith("@"):
            return "/".join(cleaned.split("/")[:2])
        return cleaned.split("/", 1)[0].split(".", 1)[0]

    @staticmethod
    def _bind_import_aliases(
        record: _ImportRecord,
        target_path: str,
        target_id: str,
        symbols_by_file: dict[str, dict[str, RepositoryGraphNode]],
        aliases: dict[str, str],
    ) -> None:
        if not record.names:
            aliases[record.specifier.rsplit(".", 1)[-1]] = target_id
            return
        for imported, alias in record.names:
            target = symbols_by_file[target_path].get(imported)
            aliases[alias] = target.id if target else target_id

    @staticmethod
    def _bind_external_aliases(record: _ImportRecord, target_id: str, aliases: dict[str, str]) -> None:
        if record.names:
            for _, alias in record.names:
                aliases[alias] = target_id
        else:
            aliases[record.specifier.rsplit("/", 1)[-1].rsplit(".", 1)[-1]] = target_id

    @staticmethod
    def _resolve_call(
        record: _CallRecord,
        aliases: dict[str, str],
        symbols_by_file: dict[str, dict[str, RepositoryGraphNode]],
        symbols_by_name: dict[str, list[RepositoryGraphNode]],
    ) -> tuple[str | None, GraphConfidence]:
        local_symbols = symbols_by_file[record.source_file]
        callee = record.callee
        leaf = callee.rsplit(".", 1)[-1]
        if callee.startswith("self.") and record.class_name:
            node = local_symbols.get(f"{record.class_name}.{leaf}") or local_symbols.get(leaf)
            if node:
                return node.id, GraphConfidence.inferred
        if callee in aliases:
            return aliases[callee], GraphConfidence.inferred
        if "." in callee:
            root, member = callee.split(".", 1)
            aliased = aliases.get(root)
            if aliased and aliased.startswith("module:"):
                target_file = next((path for path in symbols_by_file if _module_id(path) == aliased), None)
                node = symbols_by_file[target_file].get(member) if target_file else None
                return (node.id if node else aliased), GraphConfidence.inferred
            if aliased:
                return aliased, GraphConfidence.ambiguous
        local = local_symbols.get(callee) or local_symbols.get(leaf)
        if local:
            return local.id, GraphConfidence.inferred
        global_matches = symbols_by_name.get(leaf, [])
        if len(global_matches) == 1:
            return global_matches[0].id, GraphConfidence.ambiguous
        return None, GraphConfidence.ambiguous

    @staticmethod
    def _js_import_names(clause: str) -> tuple[tuple[str, str], ...]:
        clause = clause.strip()
        names: list[tuple[str, str]] = []
        brace_match = re.search(r"\{([^}]+)\}", clause)
        if brace_match:
            for item in brace_match.group(1).split(","):
                parts = [part.strip() for part in re.split(r"\s+as\s+", item.strip()) if part.strip()]
                if parts:
                    names.append((parts[0], parts[-1]))
        namespace_match = re.search(r"\*\s+as\s+([A-Za-z_$][\w$]*)", clause)
        if namespace_match:
            names.append(("*", namespace_match.group(1)))
        default_match = re.match(r"([A-Za-z_$][\w$]*)", clause)
        if default_match and not clause.startswith("{"):
            names.append(("default", default_match.group(1)))
        return tuple(names)

    @staticmethod
    def _add_edge(
        edges: dict[tuple[str, str, str, int], RepositoryGraphEdge],
        source: str,
        target: str,
        relation: GraphRelation,
        confidence: GraphConfidence,
        anchor: SourceAnchor,
    ) -> None:
        key = (source, target, relation.value, anchor.start_line)
        edges.setdefault(
            key,
            RepositoryGraphEdge(
                id=f"edge:{_slug(source, relation.value, target, str(anchor.start_line))}",
                source=source,
                target=target,
                relation=relation,
                confidence=confidence,
                anchor=anchor,
            ),
        )

    @staticmethod
    def _kind_rank(kind: GraphNodeKind) -> int:
        return {
            GraphNodeKind.repository: 0,
            GraphNodeKind.module: 1,
            GraphNodeKind.class_: 2,
            GraphNodeKind.function: 3,
            GraphNodeKind.method: 4,
            GraphNodeKind.external: 5,
        }[kind]


class _PythonCollector(ast.NodeVisitor):
    def __init__(self, path: str, source: str, language: str, module: RepositoryGraphNode):
        self.path = path
        self.source = source
        self.language = language
        self.fragment = _Fragment(nodes=[module])
        self.scope_stack: list[str] = [module.id]
        self.class_stack: list[str] = []

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            self.fragment.imports.append(
                _ImportRecord(
                    self.path,
                    alias.name,
                    node.lineno,
                    names=((alias.name.rsplit(".", 1)[-1], alias.asname or alias.name.split(".", 1)[0]),),
                )
            )

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        self.fragment.imports.append(
            _ImportRecord(
                self.path,
                node.module or "",
                node.lineno,
                level=node.level,
                names=tuple((alias.name, alias.asname or alias.name) for alias in node.names),
            )
        )

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        qualname = ".".join([*self.class_stack, node.name])
        graph_node = RepositoryGraphAnalyzer._symbol_node(
            self.path,
            self.language,
            "class",
            qualname,
            node.lineno,
            self._headline(node),
            getattr(node, "end_lineno", node.lineno),
        )
        self.fragment.nodes.append(graph_node)
        self.fragment.contains.append((self.scope_stack[-1], graph_node.id, node.lineno))
        self.class_stack.append(node.name)
        self.scope_stack.append(graph_node.id)
        self.generic_visit(node)
        self.scope_stack.pop()
        self.class_stack.pop()

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._visit_function(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._visit_function(node)

    def _visit_function(self, node: ast.FunctionDef | ast.AsyncFunctionDef) -> None:
        qualname = ".".join([*self.class_stack, node.name])
        kind = "method" if self.class_stack else "function"
        graph_node = RepositoryGraphAnalyzer._symbol_node(
            self.path,
            self.language,
            kind,
            qualname,
            node.lineno,
            self._headline(node),
            getattr(node, "end_lineno", node.lineno),
        )
        self.fragment.nodes.append(graph_node)
        self.fragment.contains.append((self.scope_stack[-1], graph_node.id, node.lineno))
        self.scope_stack.append(graph_node.id)
        self.generic_visit(node)
        self.scope_stack.pop()

    def visit_Call(self, node: ast.Call) -> None:
        callee = self._callee_name(node.func)
        if callee:
            self.fragment.calls.append(
                _CallRecord(
                    self.path,
                    self.scope_stack[-1],
                    callee,
                    node.lineno,
                    self.class_stack[-1] if self.class_stack else None,
                )
            )
        self.generic_visit(node)

    def _headline(self, node: ast.AST) -> str:
        return ast.get_source_segment(self.source, node) or node.__class__.__name__

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
