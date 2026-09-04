from __future__ import annotations

from fastapi.testclient import TestClient

from app.analysis.repository_graph import RepositoryGraphAnalyzer
from app.main import app
from app.models.repository_graph import GraphNodeKind, GraphRelation, RepositoryFile


def test_python_repository_graph_resolves_imports_calls_and_source_anchors():
    graph = RepositoryGraphAnalyzer().analyze(
        [
            RepositoryFile(
                path="service.py",
                content="def greet(name):\n    return name.upper()\n",
            ),
            RepositoryFile(
                path="main.py",
                content=(
                    "import os\n"
                    "from service import greet\n\n"
                    "def run():\n"
                    "    return greet(os.getenv('USER', 'world'))\n"
                ),
            ),
        ]
    )

    assert graph.summary.files == 2
    assert graph.summary.symbols == 2
    assert graph.summary.imports == 2
    assert graph.summary.calls == 2
    assert graph.summary.external_dependencies == 1

    nodes = {node.id: node for node in graph.nodes}
    greet = next(node for node in graph.nodes if node.anchor and node.anchor.symbol == "greet")
    run = next(node for node in graph.nodes if node.anchor and node.anchor.symbol == "run")
    call = next(edge for edge in graph.edges if edge.relation == GraphRelation.calls and edge.target == greet.id)

    assert call.source == run.id
    assert call.target == greet.id
    assert call.anchor is not None
    assert call.anchor.file == "main.py"
    assert call.anchor.start_line == 5
    assert nodes[call.target].kind == GraphNodeKind.function


def test_typescript_repository_graph_resolves_relative_module_and_named_call():
    graph = RepositoryGraphAnalyzer().analyze(
        [
            RepositoryFile(path="src/math.ts", content="export function twice(value: number) {\n  return value * 2;\n}\n"),
            RepositoryFile(
                path="src/main.ts",
                content="import { twice } from './math';\nexport const run = () => twice(21);\n",
            ),
        ]
    )

    assert graph.summary.files == 2
    assert graph.summary.imports == 1
    assert graph.summary.calls == 1
    imports = next(edge for edge in graph.edges if edge.relation == GraphRelation.imports)
    call = next(edge for edge in graph.edges if edge.relation == GraphRelation.calls)
    twice = next(node for node in graph.nodes if node.anchor and node.anchor.symbol == "twice")
    run = next(node for node in graph.nodes if node.anchor and node.anchor.symbol == "run")

    assert imports.source.startswith("module:src_main_ts")
    assert imports.target.startswith("module:src_math_ts")
    assert call.source == run.id
    assert call.target == twice.id


def test_repository_endpoint_returns_partial_graph_with_parse_warning():
    response = TestClient(app).post(
        "/api/analyze-repository",
        json={
            "files": [
                {"path": "good.py", "content": "def ok():\n    return 1\n"},
                {"path": "broken.py", "content": "def nope(:\n"},
            ]
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == 1
    assert payload["summary"]["files"] == 2
    assert payload["summary"]["symbols"] == 1
    assert payload["warnings"][0].startswith("broken.py:1:")


def test_repository_endpoint_allows_local_frontend_test_ports():
    response = TestClient(app).options(
        "/api/analyze-repository",
        headers={
            "Origin": "http://127.0.0.1:4173",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:4173"
