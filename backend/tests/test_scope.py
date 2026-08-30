from __future__ import annotations

from app.services.demo import build_demo_trace
from app.services.scope import build_scope_contract


def test_function_scope_contains_descendants_and_function_edit_range():
    bundle = build_demo_trace()
    normalize = next(node for node in bundle.program_nodes if node.label == "normalize()")

    contract = build_scope_contract(bundle.program_nodes, normalize.id)

    assert contract.selected_node_id == normalize.id
    assert normalize.id in contract.context_node_ids
    assert set(normalize.children).issubset(contract.context_node_ids)
    assert contract.search_files == ["app.py"]
    assert contract.edit_files == ["app.py"]
    assert len(contract.edit_line_ranges) == 1
    assert contract.edit_line_ranges[0].start == normalize.start_line
    assert contract.edit_line_ranges[0].end == normalize.end_line


def test_dataflow_scope_uses_def_use_neighbors_and_line_level_edit_boundary():
    bundle = build_demo_trace()
    normalize = next(node for node in bundle.program_nodes if node.label == "normalize()")
    by_id = {node.id: node for node in bundle.program_nodes}
    flows = [by_id[node_id] for node_id in normalize.children if by_id[node_id].level.value == "dataflow"]
    final_return = next(node for node in flows if node.expression == "[v / span for v in values]")

    contract = build_scope_contract(bundle.program_nodes, final_return.id)

    assert final_return.id in contract.search_node_ids
    assert set(final_return.incoming).issubset(contract.search_node_ids)
    assert normalize.id in contract.context_node_ids
    assert final_return.children[0] in contract.context_node_ids
    assert contract.edit_line_ranges[0].start == final_return.start_line
    assert contract.edit_line_ranges[0].end == final_return.end_line


def test_statement_scope_is_exact_source_range():
    bundle = build_demo_trace()
    statement = next(
        node
        for node in bundle.program_nodes
        if node.level.value == "statement" and "return [v / span" in node.label
    )

    contract = build_scope_contract(bundle.program_nodes, statement.id)

    assert contract.edit_files == ["app.py"]
    assert len(contract.edit_line_ranges) == 1
    assert contract.edit_line_ranges[0].start == statement.start_line
    assert contract.edit_line_ranges[0].end == statement.end_line
