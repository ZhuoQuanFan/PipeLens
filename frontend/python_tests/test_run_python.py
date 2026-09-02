import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).parents[1] / "api" / "run-python.py"
SPEC = importlib.util.spec_from_file_location("run_python", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def payload(statement: str):
    lines = [""] * 66 + [f"            {statement}"]
    return {"source": "\n".join(lines), "file": "model.py", "nodeId": "scale", "line": 67}


class RunPythonTests(unittest.TestCase):
    def test_executes_correct_attention_scale_and_emits_line_trace(self):
        result = MODULE.verify_payload(payload("att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))"))
        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["actual"], 4.0)
        self.assertTrue(any(event["line"] == 67 and event["event"] == "line" for event in result["trace"]))

    def test_reproduces_wrong_attention_scale_as_fault(self):
        result = MODULE.verify_payload(payload("att = (q @ k.transpose(-2, -1)) * math.sqrt(k.size(-1))"))
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["actual"], 16.0)
        self.assertEqual(result["trace"][-1]["status"], "fault")

    def test_rejects_unsafe_python(self):
        with self.assertRaisesRegex(ValueError, "verification helpers|not available"):
            MODULE.verify_payload(payload("att = __import__('os').environ"))

    def test_rejects_unrelated_vercel_origins(self):
        self.assertFalse(MODULE.allowed_origin("https://unrelated.vercel.app"))
        self.assertTrue(MODULE.allowed_origin("https://pipelens-latest-build-user.vercel.app"))


if __name__ == "__main__":
    unittest.main()
