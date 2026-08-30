from __future__ import annotations

import difflib
import importlib.util
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from app.models.trace import LineRange, ScopeContract
from app.models.verification import ExecutionDiff, ScopeViolation, TestSummary, VerificationReport
from app.services.demo import build_demo_trace
from app.services.scope import build_scope_contract
from app.tracing.runtime import RuntimeTracer


def build_demo_verification(selected_node_id: str) -> VerificationReport:
    """Run the fixed demo against real tests and verify its visual edit scope."""
    repository_root = Path(__file__).resolve().parents[3]
    demo_root = repository_root / "examples" / "python-debug-demo"
    before_path = demo_root / "app.py"
    after_path = demo_root / "app_fixed.py"
    test_path = demo_root / "test_app.py"

    trace = build_demo_trace()
    scope = build_scope_contract(trace.program_nodes, selected_node_id)

    before_source = before_path.read_text(encoding="utf-8")
    after_source = after_path.read_text(encoding="utf-8")
    test_source = test_path.read_text(encoding="utf-8")

    before_tests = _run_pytest(before_source, test_source)
    after_tests = _run_pytest(after_source, test_source)

    changed_files = ["app.py"] if before_source != after_source else []
    changed_ranges = _changed_line_ranges(before_source, after_source, "app.py")
    violations = validate_patch_scope(changed_files, changed_ranges, scope)
    execution_diffs = _execution_diffs(before_path, after_path, demo_root)
    unified_diff = "".join(
        difflib.unified_diff(
            before_source.splitlines(keepends=True),
            after_source.splitlines(keepends=True),
            fromfile="a/app.py",
            tofile="b/app.py",
        )
    )

    return VerificationReport(
        selected_node_id=selected_node_id,
        before_tests=before_tests,
        after_tests=after_tests,
        changed_files=changed_files,
        changed_line_ranges=changed_ranges,
        scope_violations=violations,
        execution_diffs=execution_diffs,
        unified_diff=unified_diff,
    )


def validate_patch_scope(
    changed_files: list[str],
    changes: list[LineRange],
    scope: ScopeContract,
) -> list[ScopeViolation]:
    """Validate a candidate patch before application against a visual scope."""
    violations: list[ScopeViolation] = []
    allowed_files = set(scope.edit_files)
    reported_files: set[str] = set()

    for file_name in changed_files:
        if file_name in allowed_files:
            continue
        reported_files.add(file_name)
        violations.append(
            ScopeViolation(
                file=file_name,
                start=1,
                end=1,
                reason="changed file is outside the visual edit scope",
            )
        )

    for change in changes:
        if change.file not in allowed_files:
            if change.file not in reported_files:
                violations.append(
                    ScopeViolation(
                        file=change.file,
                        start=change.start,
                        end=change.end,
                        reason="changed file is outside the visual edit scope",
                    )
                )
            continue

        file_ranges = [item for item in scope.edit_line_ranges if item.file == change.file]
        if not file_ranges:
            continue
        if not any(change.start >= allowed.start and change.end <= allowed.end for allowed in file_ranges):
            violations.append(
                ScopeViolation(
                    file=change.file,
                    start=change.start,
                    end=change.end,
                    reason="changed lines exceed the visual edit boundary",
                )
            )

    return violations


def _run_pytest(app_source: str, test_source: str) -> TestSummary:
    with tempfile.TemporaryDirectory(prefix="pipelens-verify-") as temp_dir:
        root = Path(temp_dir)
        (root / "app.py").write_text(app_source, encoding="utf-8")
        (root / "test_app.py").write_text(test_source, encoding="utf-8")

        started = time.perf_counter()
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "test_app.py"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        duration_ms = (time.perf_counter() - started) * 1000.0
        output = f"{result.stdout}\n{result.stderr}"

    passed = _count_pytest_summary(output, "passed")
    failed = _count_pytest_summary(output, "failed")
    failing_tests = re.findall(r"FAILED\s+([^\s]+)", output)
    return TestSummary(
        passed=passed,
        failed=failed,
        total=passed + failed,
        exit_code=result.returncode,
        duration_ms=round(duration_ms, 2),
        failing_tests=failing_tests,
    )


def _count_pytest_summary(output: str, status: str) -> int:
    match = re.search(rf"(\d+)\s+{status}", output)
    return int(match.group(1)) if match else 0


def _changed_line_ranges(before: str, after: str, file_name: str) -> list[LineRange]:
    before_lines = before.splitlines()
    after_lines = after.splitlines()
    matcher = difflib.SequenceMatcher(a=before_lines, b=after_lines)
    ranges: list[LineRange] = []

    for tag, i1, i2, _j1, _j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        start = i1 + 1
        end = max(i2, start)
        ranges.append(LineRange(file=file_name, start=start, end=end))

    return _merge_line_ranges(ranges)


def _merge_line_ranges(ranges: list[LineRange]) -> list[LineRange]:
    if not ranges:
        return []
    ordered = sorted(ranges, key=lambda item: (item.file, item.start, item.end))
    merged: list[LineRange] = [ordered[0]]
    for current in ordered[1:]:
        previous = merged[-1]
        if current.file == previous.file and current.start <= previous.end + 1:
            merged[-1] = LineRange(file=previous.file, start=previous.start, end=max(previous.end, current.end))
        else:
            merged.append(current)
    return merged


def _execution_diffs(before_path: Path, after_path: Path, repository_root: Path) -> list[ExecutionDiff]:
    before_outputs = _trace_function_outputs(before_path, repository_root, "pipelens_verify_before")
    after_outputs = _trace_function_outputs(after_path, repository_root, "pipelens_verify_after")
    names = list(dict.fromkeys([*before_outputs.keys(), *after_outputs.keys()]))

    return [
        ExecutionDiff(
            function=name,
            before_output=before_outputs.get(name),
            after_output=after_outputs.get(name),
            changed=before_outputs.get(name) != after_outputs.get(name),
        )
        for name in names
    ]


def _trace_function_outputs(path: Path, repository_root: Path, module_name: str) -> dict[str, object]:
    module = _load_module(path, module_name)
    tracer = RuntimeTracer(repository_root)
    tracer.run(module.run_pipeline, [10.0, 20.0, 30.0])
    outputs: dict[str, object] = {}
    for node in tracer.as_nodes():
        outputs[f"{node.label}()"] = node.runtime.output_values.get("return")
    return outputs


def _load_module(path: Path, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
