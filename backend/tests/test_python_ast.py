from __future__ import annotations

from app.analysis.python_ast import PythonHierarchyAnalyzer


def test_analyzer_builds_function_dataflow_and_def_use_edges(tmp_path):
    source = '''
def normalize(values: list[float]) -> list[float]:
    minimum = min(values)
    maximum = max(values)
    span = maximum - minimum
    if span == 0:
        return [0.0 for _ in values]
    return [v / span for v in values]
'''
    path = tmp_path / "app.py"
    path.write_text(source, encoding="utf-8")

    nodes = PythonHierarchyAnalyzer().analyze_file(path, tmp_path)
    by_id = {node.id: node for node in nodes}

    function = next(node for node in nodes if node.level.value == "function")
    dataflows = [by_id[node_id] for node_id in function.children if by_id[node_id].level.value == "dataflow"]

    assert len(dataflows) == 5

    minimum = next(node for node in dataflows if node.dataflow_outputs == ["minimum"])
    maximum = next(node for node in dataflows if node.dataflow_outputs == ["maximum"])
    span = next(node for node in dataflows if node.dataflow_outputs == ["span"])
    final_return = next(
        node
        for node in dataflows
        if node.dataflow_outputs == ["return"] and node.expression == "[v / span for v in values]"
    )

    assert minimum.dataflow_inputs == ["values"]
    assert minimum.expression == "min(values)"
    assert maximum.dataflow_inputs == ["values"]
    assert span.dataflow_inputs == ["maximum", "minimum"]
    assert set(span.incoming) == {minimum.id, maximum.id}
    assert final_return.dataflow_inputs == ["span", "values"]
    assert span.id in final_return.incoming
    assert final_return.id in span.outgoing

    statement = by_id[final_return.children[0]]
    assert statement.level.value == "statement"
    assert statement.parent_id == final_return.id
    assert "return [v / span" in statement.label


def test_analyzer_excludes_call_names_and_comprehension_targets_from_data_inputs(tmp_path):
    source = '''
def score(values):
    normalized = normalize(preprocess(values))
    return sum(normalized) / len(normalized)
'''
    path = tmp_path / "app.py"
    path.write_text(source, encoding="utf-8")

    nodes = PythonHierarchyAnalyzer().analyze_file(path, tmp_path)
    dataflows = [node for node in nodes if node.level.value == "dataflow"]

    normalized = next(node for node in dataflows if node.dataflow_outputs == ["normalized"])
    returned = next(node for node in dataflows if node.dataflow_outputs == ["return"])

    assert normalized.dataflow_inputs == ["values"]
    assert normalized.expression == "normalize(preprocess(values))"
    assert returned.dataflow_inputs == ["normalized"]
    assert normalized.id in returned.incoming
