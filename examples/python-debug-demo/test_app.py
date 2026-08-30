from app import normalize, run_pipeline


def test_normalize_maps_min_to_zero_and_max_to_one():
    values = [10.0, 20.0, 30.0]
    assert normalize(values) == [0.0, 0.5, 1.0]


def test_pipeline_score_uses_normalized_values():
    assert run_pipeline([10.0, 20.0, 30.0]) == 0.5
