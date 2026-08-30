from __future__ import annotations


def preprocess(values: list[float]) -> list[float]:
    return [float(v) for v in values]


def normalize(values: list[float]) -> list[float]:
    """Intentionally flawed normalization used by the MVP demo.

    The correct implementation should subtract min(values) before dividing by
    the range. Keeping the defect explicit gives PipeLens a stable debugging
    target for progressive disclosure and verification.
    """
    minimum = min(values)
    maximum = max(values)
    span = maximum - minimum
    if span == 0:
        return [0.0 for _ in values]
    return [v / span for v in values]


def score(values: list[float]) -> float:
    normalized = normalize(preprocess(values))
    return sum(normalized) / len(normalized)


def run_pipeline(values: list[float]) -> float:
    return score(values)
