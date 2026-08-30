from __future__ import annotations

from app.models.trace import (
    AgentEvent,
    ExecutionExplorationLink,
    LinkRelation,
    ProgramNode,
)


def _symbol_name(label: str) -> str:
    return label[:-2] if label.endswith("()") else label


def build_execution_exploration_links(
    program_nodes: list[ProgramNode],
    agent_events: list[AgentEvent],
) -> list[ExecutionExplorationLink]:
    """Map observable agent actions onto static/runtime program nodes.

    Matching is deliberately evidence-first and conservative:
    1. explicit node id;
    2. file + symbol;
    3. symbol only;
    4. file-level ancestor/candidate.

    The first matching rule wins for each event so the frontend can explain why
    a correspondence exists instead of receiving an opaque many-to-many graph.
    """

    by_id = {node.id: node for node in program_nodes}
    function_nodes = [node for node in program_nodes if node.level.value == "function"]
    file_nodes = [node for node in program_nodes if node.file]
    links: list[ExecutionExplorationLink] = []

    for event in agent_events:
        target = event.target
        if target is None:
            continue

        if target.node_id and target.node_id in by_id:
            links.append(
                ExecutionExplorationLink(
                    execution_node_id=target.node_id,
                    agent_event_id=event.id,
                    relation=LinkRelation.exact,
                    confidence=1.0,
                )
            )
            continue

        if target.file and target.symbol:
            match = next(
                (
                    node
                    for node in function_nodes
                    if node.file == target.file and _symbol_name(node.label) == target.symbol
                ),
                None,
            )
            if match:
                links.append(
                    ExecutionExplorationLink(
                        execution_node_id=match.id,
                        agent_event_id=event.id,
                        relation=LinkRelation.exact,
                        confidence=1.0,
                    )
                )
                continue

        if target.symbol:
            matches = [
                node for node in function_nodes if _symbol_name(node.label) == target.symbol
            ]
            if len(matches) == 1:
                links.append(
                    ExecutionExplorationLink(
                        execution_node_id=matches[0].id,
                        agent_event_id=event.id,
                        relation=LinkRelation.candidate,
                        confidence=0.85,
                    )
                )
                continue

        if target.file:
            match = next((node for node in file_nodes if node.file == target.file), None)
            if match:
                links.append(
                    ExecutionExplorationLink(
                        execution_node_id=match.id,
                        agent_event_id=event.id,
                        relation=LinkRelation.ancestor,
                        confidence=0.65,
                    )
                )

    return links


def linked_runtime_status(
    program_nodes: list[ProgramNode],
    links: list[ExecutionExplorationLink],
) -> dict[str, bool]:
    """Return whether each linked agent event points to executed code."""

    by_id = {node.id: node for node in program_nodes}
    status: dict[str, bool] = {}
    for link in links:
        node = by_id.get(link.execution_node_id)
        if node is None:
            continue
        status[link.agent_event_id] = bool(node.runtime.executed)
    return status
