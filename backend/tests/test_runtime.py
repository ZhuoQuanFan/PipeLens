from app.tracing.runtime import RuntimeTracer


def inner(value: int) -> int:
    return value * value


def outer(value: int) -> int:
    return inner(value) + 1


def test_runtime_tracer_captures_repository_calls():
    tracer = RuntimeTracer(repository_root=".")

    result = tracer.run(outer, 3)

    assert result == 10
    labels = [node.label for node in tracer.as_nodes()]
    assert "outer" in labels
    assert "inner" in labels

    inner_node = next(node for node in tracer.as_nodes() if node.label == "inner")
    assert inner_node.runtime.executed is True
    assert inner_node.runtime.output_values["return"] == "9"
    assert inner_node.file is not None
