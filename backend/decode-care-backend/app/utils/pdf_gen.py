"""
Generate a professional PDF report using ReportLab.
Returns the PDF as bytes so it can be streamed directly to the client.
"""

import io
from datetime import datetime
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.models.report import ReportOut

# ── Brand colours ─────────────────────────────────────────────────────────────
NAVY   = colors.HexColor("#0f4c75")
GREEN  = colors.HexColor("#10b981")
YELLOW = colors.HexColor("#f59e0b")
RED    = colors.HexColor("#ef4444")
BLUE   = colors.HexColor("#3b82f6")
LIGHT  = colors.HexColor("#f0f4f8")
GREY   = colors.HexColor("#64748b")


def _risk_color(level: str):
    return {"Low": GREEN, "Medium": YELLOW, "High": RED}.get(level, GREY)


def _status_color(status: str):
    return {"normal": GREEN, "high": RED, "low": BLUE}.get(status, GREY)


# ── Style helpers ─────────────────────────────────────────────────────────────
def _styles():
    base = getSampleStyleSheet()
    return {
        "title":      ParagraphStyle("title",      fontSize=22, textColor=NAVY,  fontName="Helvetica-Bold", spaceAfter=2),
        "subtitle":   ParagraphStyle("subtitle",   fontSize=10, textColor=GREY,  fontName="Helvetica"),
        "section":    ParagraphStyle("section",    fontSize=13, textColor=NAVY,  fontName="Helvetica-Bold", spaceBefore=14, spaceAfter=4),
        "body":       ParagraphStyle("body",       fontSize=10, textColor=colors.black, fontName="Helvetica", leading=14),
        "small":      ParagraphStyle("small",      fontSize=8,  textColor=GREY,  fontName="Helvetica"),
        "disclaimer": ParagraphStyle("disclaimer", fontSize=8,  textColor=GREY,  fontName="Helvetica-Oblique", leading=12),
        "right":      ParagraphStyle("right",      fontSize=10, alignment=TA_RIGHT, fontName="Helvetica"),
        "center":     ParagraphStyle("center",     fontSize=10, alignment=TA_CENTER, fontName="Helvetica"),
    }


# ── Progress bar (drawn as a coloured table row) ──────────────────────────────
def _risk_bar(score: int, level: str, width: float) -> Table:
    filled = max(width * score / 100, 0.5 * cm)
    empty  = width - filled
    data   = [["", ""]]
    t = Table(data, colWidths=[filled, empty], rowHeights=[0.45 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), _risk_color(level)),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#e2e8f0")),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING",   (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
    ]))
    return t


# ── Main PDF builder ──────────────────────────────────────────────────────────
def generate_report_pdf(report: ReportOut) -> bytes:
    buffer  = io.BytesIO()
    W, H    = A4
    margin  = 2 * cm
    usable  = W - 2 * margin
    doc     = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=margin, rightMargin=margin,
        topMargin=2.5 * cm, bottomMargin=2 * cm,
    )
    S    = _styles()
    ai   = report.ai_analysis
    date = report.created_at.strftime("%d %B %Y")
    story: list = []

    # ── Header ────────────────────────────────────────────────────────────────
    header_data = [[
        Paragraph("🏥  Decode Care", S["title"]),
        Paragraph(
            f"<b>{report.patient_name}</b><br/>"
            f"Age: {report.patient_age or 'N/A'}<br/>"
            f"Date: {date}",
            S["right"],
        ),
    ]]
    header_table = Table(header_data, colWidths=[usable * 0.6, usable * 0.4])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Paragraph("Medical Report Analysis · Confidential", S["subtitle"]))
    story.append(HRFlowable(width=usable, thickness=2, color=NAVY, spaceAfter=10))

    # ── Risk score banner ─────────────────────────────────────────────────────
    level  = report.risk_level
    score  = report.risk_score
    rc     = _risk_color(level)

    risk_badge = Table(
        [[Paragraph(f"  {level.upper()} RISK  ", ParagraphStyle("badge", fontSize=11, textColor=colors.white, fontName="Helvetica-Bold", alignment=TA_CENTER))]],
        colWidths=[3.5 * cm], rowHeights=[0.6 * cm]
    )
    risk_badge.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), rc),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
        ("TOPPADDING",    (0, 0), (0, 0), 4),
        ("BOTTOMPADDING", (0, 0), (0, 0), 4),
    ]))

    risk_row = Table(
        [[
            Paragraph(f"<b>Overall Risk Score: {score}%</b>", ParagraphStyle("rs", fontSize=13, textColor=NAVY, fontName="Helvetica-Bold")),
            risk_badge,
        ]],
        colWidths=[usable - 4 * cm, 4 * cm]
    )
    risk_row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(Spacer(1, 0.3 * cm))
    story.append(risk_row)
    story.append(Spacer(1, 0.2 * cm))
    story.append(_risk_bar(score, level, usable))
    if ai.summary:
        story.append(Spacer(1, 0.25 * cm))
        story.append(Paragraph(f"<i>{ai.summary}</i>", S["body"]))
    story.append(Spacer(1, 0.4 * cm))

    # ── Lab values table ───────────────────────────────────────────────────────
    story.append(Paragraph("Lab Values Analysis", S["section"]))

    col_w = [usable * p for p in [0.22, 0.13, 0.16, 0.1, 0.39]]
    head  = [
        Paragraph("<b>Parameter</b>",    S["body"]),
        Paragraph("<b>Value</b>",        S["body"]),
        Paragraph("<b>Normal Range</b>", S["body"]),
        Paragraph("<b>Status</b>",       S["body"]),
        Paragraph("<b>Interpretation</b>", S["body"]),
    ]
    rows  = [head]

    for field, pr in report.results.items():
        sc = _status_color(pr.status)
        rows.append([
            Paragraph(pr.unit and f"{REFERENCE_LABELS.get(field, field)}", S["body"]),
            Paragraph(f"<b>{pr.value} {pr.unit}</b>", S["body"]),
            Paragraph(pr.normal_range, S["small"]),
            Paragraph(
                f'<font color="#{_hex(sc)}"><b>{pr.status.capitalize()}</b></font>',
                S["body"]
            ),
            Paragraph(pr.explanation or "—", S["small"]),
        ])

    lab_table = Table(rows, colWidths=col_w, repeatRows=1)
    lab_table.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0),  NAVY),
        ("TEXTCOLOR",    (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",     (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, 0),  9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("GRID",         (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(lab_table)
    story.append(Spacer(1, 0.5 * cm))

    # ── Conditions + Specialists (two-column) ─────────────────────────────────
    if ai.conditions or ai.specialists:
        left_items  = "\n".join(f"• {c}" for c in ai.conditions)  if ai.conditions  else "None identified"
        right_items = "\n".join(f"• {s}" for s in ai.specialists) if ai.specialists else "General Physician"

        two_col = Table(
            [[
                [
                    Paragraph("⚠  Possible Conditions", ParagraphStyle("sec2", fontSize=11, textColor=RED, fontName="Helvetica-Bold")),
                    Spacer(1, 4),
                    Paragraph(left_items, S["body"]),
                ],
                [
                    Paragraph("👨‍⚕️  Recommended Specialists", ParagraphStyle("sec3", fontSize=11, textColor=NAVY, fontName="Helvetica-Bold")),
                    Spacer(1, 4),
                    Paragraph(right_items, S["body"]),
                ],
            ]],
            colWidths=[usable * 0.48, usable * 0.48],
            hAlign="LEFT"
        )
        two_col.setStyle(TableStyle([
            ("VALIGN",       (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND",   (0, 0), (0, 0),   colors.HexColor("#fff0f0")),
            ("BACKGROUND",   (1, 0), (1, 0),   colors.HexColor("#eff6ff")),
            ("ROUNDEDCORNERS", [4, 4, 4, 4]),
            ("LEFTPADDING",  (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING",   (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 10),
            ("LEFTPADDING",  (0, 0), (0, 0),   10),
        ]))
        story.append(two_col)
        story.append(Spacer(1, 0.4 * cm))

    # ── Preventive tips ────────────────────────────────────────────────────────
    if ai.tips:
        story.append(Paragraph("🌿  Preventive Tips", ParagraphStyle("secg", fontSize=11, textColor=GREEN, fontName="Helvetica-Bold")))
        story.append(Spacer(1, 4))
        for tip in ai.tips:
            story.append(Paragraph(f"• {tip}", S["body"]))
        story.append(Spacer(1, 0.4 * cm))

    # ── Disclaimer ─────────────────────────────────────────────────────────────
    story.append(HRFlowable(width=usable, thickness=0.5, color=GREY, spaceBefore=6, spaceAfter=6))
    story.append(Paragraph(
        "⚠️  Medical Disclaimer: This AI-based report is for health awareness purposes only and is not a substitute "
        "for professional medical diagnosis or treatment. Always consult a qualified healthcare professional before "
        "making any decisions based on this report. Decode Care © " + str(datetime.utcnow().year),
        S["disclaimer"],
    ))

    doc.build(story)
    return buffer.getvalue()


# ── Helpers ───────────────────────────────────────────────────────────────────
REFERENCE_LABELS = {
    "hemoglobin":  "Hemoglobin",
    "fbs":         "Fasting Blood Sugar",
    "hba1c":       "HbA1c",
    "cholesterol": "Total Cholesterol",
    "creatinine":  "Serum Creatinine",
    "systolic":    "Systolic BP",
    "diastolic":   "Diastolic BP",
}


def _hex(color) -> str:
    """Convert ReportLab color to hex string (without #)."""
    try:
        r = int(color.red   * 255)
        g = int(color.green * 255)
        b = int(color.blue  * 255)
        return f"{r:02x}{g:02x}{b:02x}"
    except Exception:
        return "000000"
