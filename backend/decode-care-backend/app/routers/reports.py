import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse

from app.config import get_settings
from app.models.report import LabValues, ReportCreate, ReportOut, ReportSummary
from app.services.report_service import (
    create_report,
    create_report_from_file,
    delete_report,
    get_report,
    list_reports,
)
from app.services.user_service import get_user_by_id
from app.utils.pdf_gen import generate_report_pdf
from app.utils.security import get_current_user_id

logger   = logging.getLogger(__name__)
settings = get_settings()
router   = APIRouter(prefix="/reports", tags=["Reports"])

ALLOWED_MIME = {"application/pdf", "image/jpeg", "image/png"}
MAX_BYTES    = settings.max_upload_mb * 1024 * 1024


# ── POST /reports/upload  — file upload + OCR ─────────────────────────────────
@router.post("/upload", response_model=ReportOut, status_code=201)
async def upload_report(
    file: UploadFile = File(...),
    patient_name: str | None  = Form(None),
    patient_age:  int | None  = Form(None),
    user_id: str = Depends(get_current_user_id),
):
    """Upload a PDF/image, run OCR, analyse, and store the report."""
    # Validate MIME
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}. Allowed: PDF, JPEG, PNG")

    # Read and size-check
    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise HTTPException(413, f"File exceeds {settings.max_upload_mb} MB limit")

    # Save to disk
    upload_dir = Path(settings.upload_dir) / user_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    suffix    = Path(file.filename or "upload").suffix or ".bin"
    dest_path = upload_dir / f"{user_id}_{len(contents)}{suffix}"
    dest_path.write_bytes(contents)

    # Resolve patient name
    name = patient_name
    if not name:
        user = await get_user_by_id(user_id)
        name = user.name if user else "Patient"

    try:
        report = await create_report_from_file(
            user_id      = user_id,
            patient_name = name,
            patient_age  = patient_age,
            file_path    = dest_path,
        )
    except Exception as e:
        logger.error("Report creation failed: %s", e)
        raise HTTPException(500, "Failed to process the uploaded file")

    return report


# ── POST /reports  — manual lab value entry ────────────────────────────────────
@router.post("", response_model=ReportOut, status_code=201)
async def create_manual_report(
    payload: ReportCreate,
    user_id: str = Depends(get_current_user_id),
):
    """Create a report from manually entered lab values."""
    user = await get_user_by_id(user_id)
    name = payload.patient_name or (user.name if user else "Patient")
    age  = payload.patient_age  or (user.age  if user else None)

    if not any(v is not None for v in payload.lab_values.model_dump().values()):
        raise HTTPException(400, "At least one lab value must be provided")

    return await create_report(
        user_id      = user_id,
        patient_name = name,
        patient_age  = age,
        lab          = payload.lab_values,
    )


# ── GET /reports  — list user's reports ───────────────────────────────────────
@router.get("", response_model=list[ReportSummary])
async def get_reports(user_id: str = Depends(get_current_user_id)):
    """Return a list of report summaries for the current user."""
    return await list_reports(user_id)


# ── GET /reports/{id}  — full report detail ───────────────────────────────────
@router.get("/{report_id}", response_model=ReportOut)
async def get_report_detail(
    report_id: str,
    user_id: str = Depends(get_current_user_id),
):
    report = await get_report(report_id, user_id)
    if not report:
        raise HTTPException(404, "Report not found")
    return report


# ── GET /reports/{id}/pdf  — download PDF ─────────────────────────────────────
@router.get("/{report_id}/pdf")
async def download_pdf(
    report_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Generate and stream a professional PDF for the given report."""
    report = await get_report(report_id, user_id)
    if not report:
        raise HTTPException(404, "Report not found")

    user = await get_user_by_id(user_id)

    try:
        pdf_bytes = generate_report_pdf(report)
    except Exception as e:
        logger.error("PDF generation failed: %s", e)
        raise HTTPException(500, "Failed to generate PDF")

    filename = f"DecodeCare_{report.created_at.strftime('%Y%m%d')}.pdf"
    return Response(
        content     = pdf_bytes,
        media_type  = "application/pdf",
        headers     = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── DELETE /reports/{id} ──────────────────────────────────────────────────────
@router.delete("/{report_id}", status_code=204)
async def remove_report(
    report_id: str,
    user_id: str = Depends(get_current_user_id),
):
    deleted = await delete_report(report_id, user_id)
    if not deleted:
        raise HTTPException(404, "Report not found or already deleted")
