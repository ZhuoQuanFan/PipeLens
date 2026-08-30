from app.services.demo import build_demo_trace
from app.services.verification import build_demo_verification


def test_demo_verification_uses_real_pytest_and_scope():
    trace = build_demo_trace()
    normalize = next(
        node for node in trace.program_nodes
        if node.level.value == "function" and node.label == "normalize()"
    )

    report = build_demo_verification(normalize.id)

    assert report.before_tests.total == 2
    assert report.before_tests.failed == 2
    assert report.after_tests.total == 2
    assert report.after_tests.passed == 2
    assert report.improved is True
    assert report.scope_compliant is True
    assert report.changed_files == ["app.py"]
    assert report.changed_line_ranges
    assert report.changed_line_ranges[0].start == 20
    assert report.changed_line_ranges[0].end == 20

    normalize_diff = next(item for item in report.execution_diffs if item.function == "normalize()")
    score_diff = next(item for item in report.execution_diffs if item.function == "score()")
    assert normalize_diff.changed is True
    assert score_diff.changed is True
    assert "-    return [v / span for v in values]" in report.unified_diff
    assert "+    return [(v - minimum) / span for v in values]" in report.unified_diff


def test_dataflow_scope_detects_out_of_scope_patch_when_wrong_computation_selected():
    trace = build_demo_trace()
    wrong_flow = next(
        node for node in trace.program_nodes
        if node.level.value == "dataflow" and node.file == "app.py" and node.start_line == 15
    )

    report = build_demo_verification(wrong_flow.id)

    assert report.scope_compliant is False
    assert report.scope_violations
    assert report.scope_violations[0].start == 20
