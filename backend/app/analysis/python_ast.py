from __future__ import annotations

import ast
from pathlib import Path

from app.models.trace import DisclosureLevel, ProgramNode


class PythonHierarchyAnalyzer:
    """Build a progressive program hierarchy from Python source.

    The analyzer emits:
      behavior -> logic -> function -> dataflow -> statement

    Data-flow edges are a lightweight, intraprocedural approximation grounded
    in the Python AST. They describe def-use relationships between assignment
    and return expressions. The MVP is intentionally not path-sensitive and
    does not attempt full static program analysis.
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

            last_definition: dict[str, str] = {}
            for statement in self._walk_function_statements(item.body):
                if self._is_docstring_statement(statement):
                    continue

                statement_id = self._statement_id(relative_file, item.name, statement)
                statement_source = ast.get_source_segment(source, statement) or statement.__class__.__name__
                statement_node = ProgramNode(
                    id=statement_id,
                    label=statement_source.strip().splitlines()[0][:160],
                    level=DisclosureLevel.statement,
                    file=relative_file,
                    start_line=statement.lineno,
                    end_line=getattr(statement, "end_lineno", statement.lineno),
                )

                dataflow = self._extract_dataflow(statement)
                if dataflow is None:
                    statement_node.parent_id = function_id
                    function.children.append(statement_id)
                    nodes.append(statement_node)
                    continue

                inputs, outputs, expression = dataflow
                dataflow_id = self._dataflow_id(relative_file, item.name, statement)
                dataflow_node = ProgramNode(
                    id=dataflow_id,
                    parent_id=function_id,
                    label=self._format_dataflow_label(inputs, outputs, expression),
                    level=DisclosureLevel.dataflow,
                    file=relative_file,
                    start_line=statement.lineno,
                    end_line=getattr(statement, "end_lineno", statement.lineno),
                    dataflow_inputs=inputs,
                    dataflow_outputs=outputs,
                    expression=expression,
                )

                for name in inputs:
                    producer_id = last_definition.get(name)
                    if producer_id is None or producer_id in dataflow_node.incoming:
                        continue
                    dataflow_node.incoming.append(producer_id)
                    producer = next((node for node in reversed(nodes) if node.id == producer_id), None)
                    if producer is not None and dataflow_id not in producer.outgoing:
                        producer.outgoing.append(dataflow_id)

                for name in outputs:
                    last_definition[name] = dataflow_id

                statement_node.parent_id = dataflow_id
                dataflow_node.children.append(statement_id)
                function.children.append(dataflow_id)
                nodes.extend([dataflow_node, statement_node])

        return nodes

    @staticmethod
    def _walk_function_statements(statements: list[ast.stmt]):
        """Yield function statements in lexical order, including nested blocks."""
        for statement in statements:
            yield statement

            if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                continue

            nested_blocks: list[list[ast.stmt]] = []
            for attribute in ("body", "orelse", "finalbody"):
                value = getattr(statement, attribute, None)
                if isinstance(value, list):
                    nested_blocks.append(value)

            if isinstance(statement, ast.Try):
                nested_blocks.extend(handler.body for handler in statement.handlers)

            for block in nested_blocks:
                yield from PythonHierarchyAnalyzer._walk_function_statements(block)

    @staticmethod
    def _is_docstring_statement(statement: ast.stmt) -> bool:
        return (
            isinstance(statement, ast.Expr)
            and isinstance(statement.value, ast.Constant)
            and isinstance(statement.value.value, str)
        )

    @staticmethod
    def _statement_id(relative_file: str, function_name: str, statement: ast.stmt) -> str:
        return f"statement:{relative_file}:{function_name}:{statement.lineno}:{statement.col_offset}"

    @staticmethod
    def _dataflow_id(relative_file: str, function_name: str, statement: ast.stmt) -> str:
        return f"dataflow:{relative_file}:{function_name}:{statement.lineno}:{statement.col_offset}"

    @classmethod
    def _extract_dataflow(cls, statement: ast.stmt) -> tuple[list[str], list[str], str] | None:
        if isinstance(statement, ast.Assign):
            outputs = cls._target_names_many(statement.targets)
            expression = ast.unparse(statement.value)
            inputs = cls._loaded_data_names(statement.value)
            return inputs, outputs, expression

        if isinstance(statement, ast.AnnAssign) and statement.value is not None:
            outputs = cls._target_names(statement.target)
            expression = ast.unparse(statement.value)
            inputs = cls._loaded_data_names(statement.value)
            return inputs, outputs, expression

        if isinstance(statement, ast.AugAssign):
            outputs = cls._target_names(statement.target)
            left_inputs = cls._loaded_data_names(statement.target)
            right_inputs = cls._loaded_data_names(statement.value)
            inputs = cls._unique(left_inputs + outputs + right_inputs)
            expression = f"{ast.unparse(statement.target)} {cls._operator_symbol(statement.op)} {ast.unparse(statement.value)}"
            return inputs, outputs, expression

        if isinstance(statement, ast.Return) and statement.value is not None:
            expression = ast.unparse(statement.value)
            inputs = cls._loaded_data_names(statement.value)
            return inputs, ["return"], expression

        return None

    @classmethod
    def _loaded_data_names(cls, node: ast.AST) -> list[str]:
        loaded: list[str] = []
        call_names: set[str] = set()
        comprehension_bound: set[str] = set()

        for candidate in ast.walk(node):
            if isinstance(candidate, ast.Call) and isinstance(candidate.func, ast.Name):
                call_names.add(candidate.func.id)
            if isinstance(candidate, ast.comprehension):
                comprehension_bound.update(cls._target_names(candidate.target))
            if isinstance(candidate, ast.Name) and isinstance(candidate.ctx, ast.Load):
                loaded.append(candidate.id)

        return cls._unique(
            name for name in loaded if name not in call_names and name not in comprehension_bound
        )

    @classmethod
    def _target_names_many(cls, targets: list[ast.expr]) -> list[str]:
        names: list[str] = []
        for target in targets:
            names.extend(cls._target_names(target))
        return cls._unique(names)

    @classmethod
    def _target_names(cls, target: ast.AST) -> list[str]:
        if isinstance(target, ast.Name):
            return [target.id]
        if isinstance(target, (ast.Tuple, ast.List)):
            names: list[str] = []
            for element in target.elts:
                names.extend(cls._target_names(element))
            return cls._unique(names)
        if isinstance(target, ast.Starred):
            return cls._target_names(target.value)
        if isinstance(target, ast.Attribute):
            return [ast.unparse(target)]
        if isinstance(target, ast.Subscript):
            return [ast.unparse(target)]
        return []

    @staticmethod
    def _unique(values) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for value in values:
            if not value or value in seen:
                continue
            seen.add(value)
            result.append(value)
        return result

    @staticmethod
    def _operator_symbol(operator: ast.operator) -> str:
        symbols: dict[type[ast.operator], str] = {
            ast.Add: "+",
            ast.Sub: "-",
            ast.Mult: "*",
            ast.Div: "/",
            ast.FloorDiv: "//",
            ast.Mod: "%",
            ast.Pow: "**",
            ast.MatMult: "@",
            ast.BitOr: "|",
            ast.BitAnd: "&",
            ast.BitXor: "^",
            ast.LShift: "<<",
            ast.RShift: ">>",
        }
        return symbols.get(type(operator), operator.__class__.__name__)

    @staticmethod
    def _format_dataflow_label(inputs: list[str], outputs: list[str], expression: str) -> str:
        source = ", ".join(inputs) if inputs else "constant"
        target = ", ".join(outputs) if outputs else "effect"
        return f"{source} → {expression} → {target}"
