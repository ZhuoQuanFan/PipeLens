from __future__ import annotations

import ast

from app.models.structure import PythonStructureResponse, StructureKind, StructureNode


class PythonStructureAnalyzer:
    """Extract a visualization-oriented hierarchy from Python source.

    This complements the runtime-oriented ProgramNode analyzer. The output is
    deliberately structural and stable enough to drive the pipe metaphor:

        module -> class/function -> function internals -> statements

    Class methods are preserved instead of being flattened, which is required
    for repository-scale cases such as nanoGPT's GPT / Block /
    CausalSelfAttention / MLP hierarchy.
    """

    def analyze_source(self, source: str, file_name: str = "source.py") -> PythonStructureResponse:
        tree = ast.parse(source, filename=file_name)
        lines = source.splitlines()
        root = StructureNode(
            id=f"module:{file_name}",
            label=file_name,
            kind=StructureKind.module,
            file=file_name,
            start_line=1,
            end_line=max(1, len(lines)),
        )

        class_count = 0
        function_count = 0
        statement_count = 0

        for item in tree.body:
            if isinstance(item, ast.ClassDef):
                class_count += 1
                class_node, functions, statements = self._class_node(item, source, file_name)
                function_count += functions
                statement_count += statements
                root.children.append(class_node)
            elif isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                function_node, statements = self._function_node(item, source, file_name, parent="module")
                function_count += 1
                statement_count += statements
                root.children.append(function_node)

        return PythonStructureResponse(
            root=root,
            classes=class_count,
            functions=function_count,
            statements=statement_count,
        )

    def _class_node(self, node: ast.ClassDef, source: str, file_name: str) -> tuple[StructureNode, int, int]:
        class_node = StructureNode(
            id=f"class:{file_name}:{node.name}:{node.lineno}",
            label=node.name,
            kind=StructureKind.class_,
            file=file_name,
            start_line=node.lineno,
            end_line=getattr(node, "end_lineno", node.lineno),
            source=self._headline(source, node),
        )
        function_count = 0
        statement_count = 0

        for item in node.body:
            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                method, statements = self._function_node(item, source, file_name, parent=node.name)
                class_node.children.append(method)
                function_count += 1
                statement_count += statements

        return class_node, function_count, statement_count

    def _function_node(
        self,
        node: ast.FunctionDef | ast.AsyncFunctionDef,
        source: str,
        file_name: str,
        parent: str,
    ) -> tuple[StructureNode, int]:
        function_id = f"function:{file_name}:{parent}:{node.name}:{node.lineno}"
        function_node = StructureNode(
            id=function_id,
            label=f"{node.name}()",
            kind=StructureKind.function,
            file=file_name,
            start_line=node.lineno,
            end_line=getattr(node, "end_lineno", node.lineno),
            source=self._headline(source, node),
        )

        statement_count = 0
        for statement in self._visible_statements(node.body):
            if self._is_docstring(statement):
                continue
            statement_count += 1
            structure = self._statement_node(statement, source, file_name, function_id)
            function_node.children.append(structure)

        return function_node, statement_count

    def _statement_node(self, node: ast.stmt, source: str, file_name: str, parent: str) -> StructureNode:
        kind = StructureKind.dataflow if isinstance(
            node,
            (ast.Assign, ast.AnnAssign, ast.AugAssign, ast.Return),
        ) else StructureKind.statement
        segment = ast.get_source_segment(source, node) or node.__class__.__name__
        label = " ".join(segment.strip().split())[:150]
        return StructureNode(
            id=f"{kind.value}:{file_name}:{parent}:{node.lineno}:{node.col_offset}",
            label=label,
            kind=kind,
            file=file_name,
            start_line=node.lineno,
            end_line=getattr(node, "end_lineno", node.lineno),
            source=label,
        )

    @classmethod
    def _visible_statements(cls, statements: list[ast.stmt]):
        for statement in statements:
            yield statement
            if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                continue
            for attribute in ("body", "orelse", "finalbody"):
                value = getattr(statement, attribute, None)
                if isinstance(value, list):
                    yield from cls._visible_statements(value)
            if isinstance(statement, ast.Try):
                for handler in statement.handlers:
                    yield from cls._visible_statements(handler.body)

    @staticmethod
    def _is_docstring(statement: ast.stmt) -> bool:
        return (
            isinstance(statement, ast.Expr)
            and isinstance(statement.value, ast.Constant)
            and isinstance(statement.value.value, str)
        )

    @staticmethod
    def _headline(source: str, node: ast.AST) -> str | None:
        segment = ast.get_source_segment(source, node)
        if not segment:
            return None
        return segment.strip().splitlines()[0][:160]
