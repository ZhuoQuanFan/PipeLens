from __future__ import annotations

import ast
from pathlib import Path

from app.models.trace import DisclosureLevel, ProgramNode


class PythonHierarchyAnalyzer:
    """Build the first disclosure hierarchy from Python source.

    MVP hierarchy:
      behavior -> logic -> function -> statement

    Data-flow extraction is intentionally deferred to a later milestone; this
    analyzer only emits relationships that can be grounded in the AST.
    """

    def analyze_file(self, file_path: str | Path, repository_root: str | Path) -> list[ProgramNode]:
        file_path = Path(file_path).resolve()
        repository_root = Path(repository_root).resolve()
        source = file_path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(file_path))
        relative_file = str(file_path.relative_to(repository_root))

        behavior_id = f"behavior:{relative_file}"
        behavior = ProgramNode(
            id=behavior_id,
            label=file_path.stem,
            level=DisclosureLevel.behavior,
            file=relative_file,
            start_line=1,
            end_line=len(source.splitlines()),
        )

        logic_id = f"logic:{relative_file}:pipeline"
        logic = ProgramNode(
            id=logic_id,
            parent_id=behavior_id,
            label="program pipeline",
            level=DisclosureLevel.logic,
            file=relative_file,
            start_line=1,
            end_line=len(source.splitlines()),
        )
        behavior.children.append(logic_id)

        nodes: list[ProgramNode] = [behavior, logic]

        for item in tree.body:
            if not isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue

            function_id = f"function:{relative_file}:{item.name}:{item.lineno}"
            function = ProgramNode(
                id=function_id,
                parent_id=logic_id,
                label=f"{item.name}()",
                level=DisclosureLevel.function,
                file=relative_file,
                start_line=item.lineno,
                end_line=getattr(item, "end_lineno", item.lineno),
            )
            logic.children.append(function_id)
            nodes.append(function)

            for statement in item.body:
                statement_id = f"statement:{relative_file}:{statement.lineno}"
                statement_source = ast.get_source_segment(source, statement) or statement.__class__.__name__
                statement_node = ProgramNode(
                    id=statement_id,
                    parent_id=function_id,
                    label=statement_source.strip().splitlines()[0][:120],
                    level=DisclosureLevel.statement,
                    file=relative_file,
                    start_line=statement.lineno,
                    end_line=getattr(statement, "end_lineno", statement.lineno),
                )
                function.children.append(statement_id)
                nodes.append(statement_node)

        return nodes
