"""Unit tests for risk classification and scoring — no DB or network needed."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models.report import LabValues
from app.utils.risk import classify, compute_risk


# ── classify() ────────────────────────────────────────────────────────────────

def test_hemoglobin_normal():
    assert classify("hemoglobin", 15.0) == "normal"

def test_hemoglobin_low():
    assert classify("hemoglobin", 11.5) == "low"

def test_hemoglobin_high():
    assert classify("hemoglobin", 18.0) == "high"

def test_cholesterol_no_lower_bound():
    # Cholesterol has no low_below → a value of 10 should still be "normal" (not "low")
    assert classify("cholesterol", 10.0) == "normal"

def test_cholesterol_high():
    assert classify("cholesterol", 250.0) == "high"

def test_systolic_no_lower_bound():
    assert classify("systolic", 80.0) == "normal"

def test_systolic_high():
    assert classify("systolic", 135.0) == "high"

def test_fbs_low():
    assert classify("fbs", 60.0) == "low"

def test_fbs_normal():
    assert classify("fbs", 85.0) == "normal"

def test_fbs_high():
    assert classify("fbs", 130.0) == "high"


# ── compute_risk() ────────────────────────────────────────────────────────────

def test_all_normal_is_low_risk():
    lab = LabValues(hemoglobin=15.0, fbs=88.0, hba1c=5.2, cholesterol=185.0, creatinine=0.9, systolic=115.0, diastolic=75.0)
    score, level = compute_risk(lab)
    assert score == 0
    assert level == "Low"

def test_all_abnormal_is_high_risk():
    lab = LabValues(hemoglobin=10.0, fbs=145.0, hba1c=8.5, cholesterol=280.0, creatinine=2.5, systolic=160.0, diastolic=100.0)
    score, level = compute_risk(lab)
    assert score == 100
    assert level == "High"

def test_partial_values():
    # Only two fields provided — score should be based on those only
    lab = LabValues(fbs=130.0, hba1c=6.5)   # both abnormal → 100%
    score, level = compute_risk(lab)
    assert score == 100
    assert level == "High"

def test_mixed_risk_medium():
    # hemoglobin normal (15), fbs high (130), hba1c normal (5.0), cholesterol high (220)
    # abnormal weight = fbs(20) + cholesterol(15) = 35 out of 70 total → 50% → Medium
    lab = LabValues(hemoglobin=15.0, fbs=130.0, hba1c=5.0, cholesterol=220.0)
    score, level = compute_risk(lab)
    assert level == "Medium"
    assert 31 <= score <= 60

def test_empty_values_zero_risk():
    lab = LabValues()
    score, level = compute_risk(lab)
    assert score == 0
    assert level == "Low"


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
