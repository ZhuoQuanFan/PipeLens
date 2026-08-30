from __future__ import annotations

from app.models.trace import DisclosureLevel, LineRange, ProgramNode, ScopeContract


def build_scope_contract(program_nodes: list[ProgramNode], selected_node_id: str) -> ScopeContract:
    """Translate one visual program selection into explicit agent boundaries.

    The contract is deterministic and grounded only in observable/static program
    structure. It does not ask an LLM to decide the edit boundary.
    """
    by_id = {node.id: node for node in program_nodes}
    selected = by_id.get(selected_node_id)
    if selected is None:
        raise ValueError(f"Unknown program node: {selected_node_id}")

    descendants = _descendant_ids(selected, by_id)
    neighbors = _unique([*selected.incoming, *selected.outgoing])
    owning_function = _owning_function(selected, by_id)

    if selected.level == DisclosureLevel.function:
        search_ids = _unique([selected.id, *selected.children])
        context_ids = _unique([selected.id, *descendants])
    elif selected.level == DisclosureLevel.dataflow:
        search_ids = _unique([selected.id, *neighbors])
        context_ids = _unique([
            owning_function.id if owning_function else None,
            selected.id,
            *selected.incoming,
            *selected.children,
        ])
    elif selected.level == DisclosureLevel.statement:
        parent = by_id.get(selected.parent_id or "")
        parent_neighbors = [*(parent.incoming if parent else []), *(parent.outgoing if parent else [])]
        search_ids = _unique([selected.id, parent.id if parent else None, *parent_neighbors])
        context_ids = _unique([
            owning_function.id if owning_function else None,
            parent.id if parent else None,
            selected.id,
        ])
    else:
        search_ids = _unique([selected.id, *selected.children])
        context_ids = _unique([selected.id, *descendants])

    search_files = _files_for(search_ids, by_id)
    edit_files, edit_ranges = _edit_boundary(selected, descendants, by_id)

    return ScopeContract(
        selected_node_id=selected.id,
        search_node_ids=search_ids,
        search_files=search_files,
        context_node_ids=context_ids,
        include_runtime_values=owning_function is not None or selected.level == DisclosureLevel.function,
        include_tests=True,
        edit_files=edit_files,
        edit_line_ranges=edit_ranges,
    )


def _descendant_ids(node: ProgramNode, by_id: dict[str, ProgramNode]) -> list[str]:
    queue = list(node.children)
    result: list[str] = []
    seen: set[str] = set()
    while queue:
        node_id = queue.pop(0)
        if node_id in seen:
            continue
        seen.add(node_id)
        child = by_id.get(node_id)
        if child is None:
            continue
        result.append(node_id)
        queue.extend(child.children)
    return result


def _owning_function(node: ProgramNode, by_id: dict[str, ProgramNode]) -> ProgramNode | None:
    current = node
    while True:
        if current.level == DisclosureLevel.function:
            return current
        if not current.parent_id:
            return None
        parent = by_id.get(current.parent_id)
        if parent is None:
            return None
        current = parent


def _edit_boundary(
    selected: ProgramNode,
    descendants: list[str],
    by_id: dict[str, ProgramNode],
) -> tuple[list[str], list[LineRange]]:
    if selected.level in {DisclosureLevel.function, DisclosureLevel.dataflow, DisclosureLevel.statement}:
        if selected.file is None:
            return [], []
        files = [selected.file]
        if selected.start_line is None or selected.end_line is None:
            return files, []
        return files, [LineRange(file=selected.file, start=selected.start_line, end=selected.end_line)]

    descendant_nodes = [by_id[node_id] for node_id in descendants if node_id in by_id]
    files = _unique(node.file for node in [selected, *descendant_nodes] if node.file)
    return files, []


def _files_for(node_ids: list[str], by_id: dict[str, ProgramNode]) -> list[str]:
    return _unique(by_id[node_id].file for node_id in node_ids if node_id in by_id and by_id[node_id].file)


def _unique(values) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value is None or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
