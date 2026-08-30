from fastapi.testclient import TestClient

from app.analysis.python_structure import PythonStructureAnalyzer
from app.main import app


SOURCE = '''
import math

class CausalSelfAttention:
    def forward(self, x):
        q = x
        k = x
        att = (q @ k) * (1.0 / math.sqrt(64))
        return att

class Block:
    def forward(self, x):
        x = x + self.attn(x)
        return x

def helper(x):
    return x
'''.strip()


def test_structure_analyzer_preserves_classes_methods_and_statements():
    result = PythonStructureAnalyzer().analyze_source(SOURCE, "model.py")

    assert result.classes == 2
    assert result.functions == 3
    attention = next(node for node in result.root.children if node.label == "CausalSelfAttention")
    forward = next(node for node in attention.children if node.label == "forward()")
    assert any("att = (q @ k)" in child.label for child in forward.children)
    assert all(child.file == "model.py" for child in forward.children)


def test_structure_endpoint_returns_pipe_ready_hierarchy():
    client = TestClient(app)
    response = client.post(
        "/api/analyze-python-structure",
        json={"file": "model.py", "source": SOURCE},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["root"]["kind"] == "module"
    assert [node["label"] for node in payload["root"]["children"]][:2] == [
        "CausalSelfAttention",
        "Block",
    ]


def test_structure_endpoint_rejects_invalid_python():
    client = TestClient(app)
    response = client.post(
        "/api/analyze-python-structure",
        json={"file": "broken.py", "source": "def broken(:\n    pass"},
    )
    assert response.status_code == 422
