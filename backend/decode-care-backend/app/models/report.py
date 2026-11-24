from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ── Lab values ────────────────────────────────────────────────────────────────

class LabValues(BaseModel):
    hemoglobin: Optional[float] = Field(None, ge=0, le=30,  description="g/dL")
    fbs: Optional[float]        = Field(None, ge=0, le=600,  description="Fasting Blood Sugar mg/dL")
    hba1c: Optional[float]      = Field(None, ge=0, le=20,   description="%")
    cholesterol: Optional[float]= Field(None, ge=0, le=1000, description="mg/dL")
    creatinine: Optional[float] = Field(None, ge=0, le=30,   description="mg/dL")
    systolic: Optional[float]   = Field(None, ge=0, le=300,  description="mmHg")
    diastolic: Optional[float]  = Field(None, ge=0, le=200,  description="mmHg")


# ── Per-parameter result ──────────────────────────────────────────────────────

class ParameterResult(BaseModel):
    value: float
    unit: str
    status: str               # "normal" | "high" | "low"
    normal_range: str
    explanation: str = ""


# ── AI output ─────────────────────────────────────────────────────────────────

class AIAnalysis(BaseModel):
    summary: str = ""
    conditions: list[str] = []
    specialists: list[str] = []
    tips: list[str] = []


# ── Full report ───────────────────────────────────────────────────────────────

class ReportCreate(BaseModel):
    """Used when the frontend submits lab values manually."""
    lab_values: LabValues
    patient_name: Optional[str] = None   # override if different from account name
    patient_age: Optional[int]  = None


class ReportOut(BaseModel):
    id: str
    user_id: str
    patient_name: str
    patient_age: Optional[int]
    lab_values: LabValues
    results: dict[str, ParameterResult]  # key = field name
    risk_score: int                       # 0–100
    risk_level: str                       # Low | Medium | High
    ai_analysis: AIAnalysis
    file_path: Optional[str] = None       # stored upload path (server-side)
    created_at: datetime


class ReportSummary(BaseModel):
    """Lightweight version for the history list."""
    id: str
    risk_score: int
    risk_level: str
    created_at: datetime
    patient_name: str
