"""
Risk classification engine.

Each lab parameter has:
  low_below   – below this → "low"    (None means no lower bound)
  high_above  – above this → "high"
  weight      – contribution to overall risk score (all weights sum to 100)
  unit        – display unit
  label       – human-readable name
  range_text  – display string for normal range
"""

from typing import Optional
from app.models.report import LabValues, ParameterResult


# ── Reference table ───────────────────────────────────────────────────────────

REFERENCE: dict[str, dict] = {
    "hemoglobin": {
        "low_below":  13.0,
        "high_above": 17.0,
        "weight":     15,
        "unit":       "g/dL",
        "label":      "Hemoglobin",
        "range_text": "13–17 g/dL",
    },
    "fbs": {
        "low_below":  70.0,
        "high_above": 99.0,
        "weight":     20,
        "unit":       "mg/dL",
        "label":      "Fasting Blood Sugar",
        "range_text": "70–99 mg/dL",
    },
    "hba1c": {
        "low_below":  4.0,
        "high_above": 5.6,
        "weight":     20,
        "unit":       "%",
        "label":      "HbA1c",
        "range_text": "4.0–5.6%",
    },
    "cholesterol": {
        "low_below":  None,
        "high_above": 200.0,
        "weight":     15,
        "unit":       "mg/dL",
        "label":      "Total Cholesterol",
        "range_text": "<200 mg/dL",
    },
    "creatinine": {
        "low_below":  0.6,
        "high_above": 1.2,
        "weight":     15,
        "unit":       "mg/dL",
        "label":      "Serum Creatinine",
        "range_text": "0.6–1.2 mg/dL",
    },
    "systolic": {
        "low_below":  None,
        "high_above": 120.0,
        "weight":     10,
        "unit":       "mmHg",
        "label":      "Systolic BP",
        "range_text": "<120 mmHg",
    },
    "diastolic": {
        "low_below":  None,
        "high_above": 80.0,
        "weight":     5,
        "unit":       "mmHg",
        "label":      "Diastolic BP",
        "range_text": "<80 mmHg",
    },
}


# ── Classification ─────────────────────────────────────────────────────────────

def classify(field: str, value: float) -> str:
    """Return 'low' | 'normal' | 'high'."""
    ref = REFERENCE.get(field)
    if ref is None:
        return "normal"
    if ref["low_below"] is not None and value < ref["low_below"]:
        return "low"
    if value > ref["high_above"]:
        return "high"
    return "normal"


# ── Risk score ────────────────────────────────────────────────────────────────

def compute_risk(lab: LabValues) -> tuple[int, str]:
    """
    Return (risk_score 0-100, risk_level).
    Only fields that are provided (not None) contribute to the score.
    """
    total_weight = 0
    abnormal_weight = 0

    for field, ref in REFERENCE.items():
        value: Optional[float] = getattr(lab, field, None)
        if value is None:
            continue
        total_weight += ref["weight"]
        if classify(field, value) != "normal":
            abnormal_weight += ref["weight"]

    if total_weight == 0:
        return 0, "Low"

    score = round((abnormal_weight / total_weight) * 100)

    if score <= 30:
        level = "Low"
    elif score <= 60:
        level = "Medium"
    else:
        level = "High"

    return score, level


# ── Build per-parameter results ───────────────────────────────────────────────

def build_results(lab: LabValues, explanations: dict[str, str]) -> dict[str, ParameterResult]:
    results: dict[str, ParameterResult] = {}
    for field, ref in REFERENCE.items():
        value: Optional[float] = getattr(lab, field, None)
        if value is None:
            continue
        results[field] = ParameterResult(
            value=value,
            unit=ref["unit"],
            status=classify(field, value),
            normal_range=ref["range_text"],
            explanation=explanations.get(field, ""),
        )
    return results
