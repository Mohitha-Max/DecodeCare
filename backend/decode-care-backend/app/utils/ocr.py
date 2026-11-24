"""
OCR utilities for extracting lab values from uploaded files.

Supports:
  - Images  : JPG, PNG  → pytesseract
  - PDFs    : converted to images via pdf2image → pytesseract

After extracting raw text the module runs regex-based parsing to pull
out the seven key lab parameters.
"""

import re
import io
import logging
from pathlib import Path
from typing import Optional

try:
    import pytesseract
    from PIL import Image
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

try:
    from pdf2image import convert_from_path
    PDF2IMAGE_AVAILABLE = True
except ImportError:
    PDF2IMAGE_AVAILABLE = False

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

if TESSERACT_AVAILABLE and settings.tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd


# ── Text extraction ───────────────────────────────────────────────────────────

def extract_text_from_image(path: Path) -> str:
    if not TESSERACT_AVAILABLE:
        return ""
    try:
        img = Image.open(path)
        # Upscale small images for better OCR accuracy
        w, h = img.size
        if w < 1000:
            img = img.resize((w * 2, h * 2), Image.LANCZOS)
        return pytesseract.image_to_string(img, config="--psm 6")
    except Exception as e:
        logger.warning("OCR image extraction failed: %s", e)
        return ""


def extract_text_from_pdf(path: Path) -> str:
    """Convert each PDF page to an image, then OCR."""
    if not PDF2IMAGE_AVAILABLE or not TESSERACT_AVAILABLE:
        return ""
    try:
        pages = convert_from_path(str(path), dpi=200)
        texts = [pytesseract.image_to_string(p, config="--psm 6") for p in pages]
        return "\n".join(texts)
    except Exception as e:
        logger.warning("OCR PDF extraction failed: %s", e)
        return ""


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return extract_text_from_pdf(path)
    elif suffix in {".jpg", ".jpeg", ".png"}:
        return extract_text_from_image(path)
    return ""


# ── Lab value parsing ─────────────────────────────────────────────────────────

# Each pattern: (field_name, list_of_regex_patterns)
# Patterns try to match "Label ... numeric_value" with common OCR noise in mind.
_PATTERNS: list[tuple[str, list[str]]] = [
    ("hemoglobin", [
        r"h[ae]moglobin[^\d]*(\d+\.?\d*)",
        r"\bHb\b[^\d]*(\d+\.?\d*)",
        r"\bHGB\b[^\d]*(\d+\.?\d*)",
    ]),
    ("fbs", [
        r"fasting\s*blood\s*sugar[^\d]*(\d+\.?\d*)",
        r"\bFBS\b[^\d]*(\d+\.?\d*)",
        r"fasting\s*glucose[^\d]*(\d+\.?\d*)",
        r"blood\s*glucose[^\d]*(\d+\.?\d*)",
    ]),
    ("hba1c", [
        r"hba1c[^\d]*(\d+\.?\d*)",
        r"hb\s*a1c[^\d]*(\d+\.?\d*)",
        r"glycated\s*haemoglobin[^\d]*(\d+\.?\d*)",
        r"glyco?sylated[^\d]*(\d+\.?\d*)",
    ]),
    ("cholesterol", [
        r"total\s*cholesterol[^\d]*(\d+\.?\d*)",
        r"cholesterol[\s,;:]*total[^\d]*(\d+\.?\d*)",
        r"\bTC\b[^\d]*(\d+\.?\d*)",
    ]),
    ("creatinine", [
        r"serum\s*creatinine[^\d]*(\d+\.?\d*)",
        r"creatinine[^\d]*(\d+\.?\d*)",
        r"\bCr\b[^\d]*(\d+\.?\d*)",
    ]),
    ("systolic", [
        r"systolic[^\d]*(\d+\.?\d*)",
        r"blood\s*pressure[^\d]*(\d+)[\s/\\]+\d",   # "120/80" → 120
        r"BP[^\d]*(\d+)[\s/\\]+\d",
    ]),
    ("diastolic", [
        r"diastolic[^\d]*(\d+\.?\d*)",
        r"blood\s*pressure[^\d]*\d+[\s/\\]+(\d+)",  # "120/80" → 80
        r"BP[^\d]*\d+[\s/\\]+(\d+)",
    ]),
]


def parse_lab_values(text: str) -> dict[str, Optional[float]]:
    """
    Return dict with extracted float values (or None if not found).
    """
    text_lower = text.lower()
    results: dict[str, Optional[float]] = {}

    for field, patterns in _PATTERNS:
        val: Optional[float] = None
        for pattern in patterns:
            m = re.search(pattern, text_lower)
            if m:
                try:
                    val = float(m.group(1))
                    break
                except ValueError:
                    continue
        results[field] = val

    return results


# ── Public entry point ────────────────────────────────────────────────────────

def ocr_extract(file_path: Path) -> dict[str, Optional[float]]:
    """
    Run OCR on the given file and return parsed lab values.
    Returns empty dict on failure (caller should fall back to manual entry).
    """
    try:
        text = extract_text(file_path)
        logger.debug("OCR raw text (%d chars): %s…", len(text), text[:200])
        return parse_lab_values(text)
    except Exception as e:
        logger.error("ocr_extract failed: %s", e)
        return {}
