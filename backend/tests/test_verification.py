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
    assert report.changed_line_ranges[0].start == 21
    assert report.changed_line_ranges[0].end == 21

    normalize_diff = next(item for item in report.execution_diffs if item.function == "normalize()")
    score_diff = next(item for item in report.execution_diffs if item.function == "score()")
    assert normalize_diff.changed is True
    assert score_diff.changed is True
    assert "-    return [v / span for v in values]" in report.unified_diff
    assert "+    return [(v - minimum) / span for v in values]" in report.unified_diff


def test_statement_scope_detects_out_of_scope_patch_when_wrong_statement_selected():
    trace = build_demo_trace()
    normalize = next(
        node for node in trace.program_nodes
        if node.level.value == "function" and node.label == "normalize()"
    )
    statements = [node for node in trace.program_nodes if node.parent_id == normalize.id and node.level.value == "statement"]
    wrong_statement = next(node for node in statements if node.start_line == 15)

    report = build_demo_verification(wrong_statement.id)

    assert report.scope_compliant is False
    assert report.scope_violations
    assert report.scope_violations[0].start == 21
