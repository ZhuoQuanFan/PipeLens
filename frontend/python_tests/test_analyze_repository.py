from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "api" / "analyze-repository.py"
SPEC = importlib.util.spec_from_file_location("pipelens_vercel_repository_api", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class AnalyzeRepositoryApiTests(unittest.TestCase):
    def test_python_graph_resolves_local_import_call_and_source(self):
        graph = MODULE.analyze_repository([
            {"path": "service.py", "content": "def greet(name):\n    return name.upper()\n", "language": "python"},
            {"path": "main.py", "content": "from service import greet\n\ndef run():\n    return greet('world')\n", "language": "python"},
        ])

        self.assertEqual(graph["summary"], {
            "files": 2,
            "symbols": 2,
            "imports": 1,
            "calls": 1,
            "external_dependencies": 0,
        })
        greet = next(node for node in graph["nodes"] if node.get("anchor") and node["anchor"].get("symbol") == "greet")
        call = next(edge for edge in graph["edges"] if edge["relation"] == "calls")
        self.assertEqual(call["target"], greet["id"])
        self.assertEqual(call["anchor"]["start_line"], 4)

    def test_typescript_graph_and_invalid_paths_return_partial_evidence(self):
        graph = MODULE.analyze_repository([
            {"path": "../secret.py", "content": "value = 1"},
            {"path": "src/math.ts", "content": "export function twice(value) { return value * 2; }"},
            {"path": "src/main.ts", "content": "import { twice } from './math';\nexport const run = () => twice(21);"},
        ])

        self.assertEqual(graph["summary"]["files"], 2)
        self.assertEqual(graph["summary"]["imports"], 1)
        self.assertEqual(graph["summary"]["calls"], 1)
        self.assertTrue(graph["warnings"][0].startswith("Invalid repository-relative path"))

    def test_origin_policy_allows_local_and_pipelens_deployments_only(self):
        self.assertTrue(MODULE._allowed_origin("http://127.0.0.1:5173"))
        self.assertTrue(MODULE._allowed_origin("https://pipelens-latest.vercel.app"))
        self.assertTrue(MODULE._allowed_origin("https://pipelens-latest-preview-team.vercel.app"))
        self.assertFalse(MODULE._allowed_origin("https://unrelated-project.vercel.app"))


if __name__ == "__main__":
    unittest.main()
