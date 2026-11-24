"""
Report service — orchestrates OCR → risk → AI → persist.
"""

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from bson import ObjectId

from app.database import get_db
from app.models.report import (
    AIAnalysis,
    LabValues,
    ReportOut,
    ReportSummary,
)
from app.services.ai_service import get_ai_analysis
from app.utils.ocr import ocr_extract
from app.utils.risk import build_results, compute_risk

logger = logging.getLogger(__name__)


def _doc_to_out(doc: dict) -> ReportOut:
    """Convert a raw MongoDB document → ReportOut."""
    from app.models.report import ParameterResult

    raw_results = doc.get("results", {})
    results = {
        k: ParameterResult(**v) for k, v in raw_results.items()
    }

    return ReportOut(
        id           = str(doc["_id"]),
        user_id      = doc["user_id"],
        patient_name = doc["patient_name"],
        patient_age  = doc.get("patient_age"),
        lab_values   = LabValues(**doc["lab_values"]),
        results      = results,
        risk_score   = doc["risk_score"],
        risk_level   = doc["risk_level"],
        ai_analysis  = AIAnalysis(**doc.get("ai_analysis", {})),
        file_path    = doc.get("file_path"),
        created_at   = doc["created_at"],
    )


# ── Create report from manual lab values ──────────────────────────────────────

async def create_report(
    user_id: str,
    patient_name: str,
    patient_age: Optional[int],
    lab: LabValues,
    file_path: Optional[str] = None,
) -> ReportOut:
    db = get_db()

    # 1. Risk calculation
    risk_score, risk_level = compute_risk(lab)

    # 2. AI analysis
    ai_analysis, explanations = await get_ai_analysis(lab, patient_name, patient_age)

    # 3. Build per-parameter results
    results = build_results(lab, explanations)

    # 4. Persist
    now = datetime.now(timezone.utc)
    doc = {
        "user_id":      user_id,
        "patient_name": patient_name,
        "patient_age":  patient_age,
        "lab_values":   lab.model_dump(exclude_none=True),
        "results":      {k: v.model_dump() for k, v in results.items()},
        "risk_score":   risk_score,
        "risk_level":   risk_level,
        "ai_analysis":  ai_analysis.model_dump(),
        "file_path":    file_path,
        "created_at":   now,
    }
    inserted = await db.reports.insert_one(doc)
    doc["_id"] = inserted.inserted_id
    return _doc_to_out(doc)


# ── Create report from uploaded file (OCR → lab values → same pipeline) ───────

async def create_report_from_file(
    user_id: str,
    patient_name: str,
    patient_age: Optional[int],
    file_path: Path,
) -> ReportOut:
    # Run OCR
    extracted = ocr_extract(file_path)
    logger.info("OCR extracted %d fields from %s", len([v for v in extracted.values() if v]), file_path.name)

    # Build LabValues from whatever was found
    lab = LabValues(**{k: v for k, v in extracted.items() if v is not None})

    return await create_report(
        user_id      = user_id,
        patient_name = patient_name,
        patient_age  = patient_age,
        lab          = lab,
        file_path    = str(file_path),
    )


# ── List reports for a user ───────────────────────────────────────────────────

async def list_reports(user_id: str) -> list[ReportSummary]:
    db      = get_db()
    cursor  = db.reports.find(
        {"user_id": user_id},
        {"risk_score": 1, "risk_level": 1, "created_at": 1, "patient_name": 1}
    ).sort("created_at", -1)

    summaries = []
    async for doc in cursor:
        summaries.append(ReportSummary(
            id           = str(doc["_id"]),
            risk_score   = doc["risk_score"],
            risk_level   = doc["risk_level"],
            created_at   = doc["created_at"],
            patient_name = doc["patient_name"],
        ))
    return summaries


# ── Get single report (enforces ownership) ────────────────────────────────────

async def get_report(report_id: str, user_id: str) -> Optional[ReportOut]:
    db  = get_db()
    try:
        oid = ObjectId(report_id)
    except Exception:
        return None

    doc = await db.reports.find_one({"_id": oid, "user_id": user_id})
    if not doc:
        return None
    return _doc_to_out(doc)


# ── Delete report ─────────────────────────────────────────────────────────────

async def delete_report(report_id: str, user_id: str) -> bool:
    db = get_db()
    try:
        oid = ObjectId(report_id)
    except Exception:
        return False
    result = await db.reports.delete_one({"_id": oid, "user_id": user_id})
    return result.deleted_count == 1
