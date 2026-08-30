from __future__ import annotations


def preprocess(values: list[float]) -> list[float]:
    return [float(v) for v in values]


def normalize(values: list[float]) -> list[float]:
    """Correct min-max normalization used as the demo's verified patch."""
    minimum = min(values)
    maximum = max(values)
    span = maximum - minimum
    if span == 0:
        return [0.0 for _ in values]
    return [(v - minimum) / span for v in values]


def score(values: list[float]) -> float:
    normalized = normalize(preprocess(values))
    return sum(normalized) / len(normalized)


def run_pipeline(values: list[float]) -> float:
    return score(values)
