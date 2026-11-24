"""
AI service: calls the Anthropic API to generate health analysis.
Returns structured AIAnalysis + per-field explanations.
"""

import json
import logging
import httpx

from app.config import get_settings
from app.models.report import AIAnalysis, LabValues

logger   = logging.getLogger(__name__)
settings = get_settings()

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
MODEL         = "claude-sonnet-4-20250514"


def _build_prompt(lab: LabValues, patient_name: str, patient_age: int | None) -> str:
    from app.utils.risk import REFERENCE, classify

    lines = []
    for field, ref in REFERENCE.items():
        val = getattr(lab, field, None)
        if val is None:
            continue
        status = classify(field, val)
        lines.append(f"  {ref['label']}: {val} {ref['unit']} → {status.upper()}")

    age_str = f", Age {patient_age}" if patient_age else ""

    return f"""You are a clinical decision-support AI assistant.

Patient: {patient_name}{age_str}
Lab results:
{chr(10).join(lines)}

Respond ONLY with a single valid JSON object — no markdown, no extra text.
Use exactly this structure:
{{
  "explanations": {{
    "hemoglobin": "...",
    "fbs": "...",
    "hba1c": "...",
    "cholesterol": "...",
    "creatinine": "...",
    "systolic": "...",
    "diastolic": "..."
  }},
  "conditions":  ["condition1", "condition2"],
  "specialists": ["specialist1"],
  "tips":        ["tip1", "tip2", "tip3"],
  "summary":     "One concise sentence summarising the overall health picture."
}}

Rules:
- Only include explanations for parameters that were provided.
- Only list conditions/specialists that are genuinely relevant.
- Tips should be practical and patient-friendly.
- Keep each explanation under 25 words.
- Do NOT include a disclaimer inside the JSON.
"""


async def get_ai_analysis(
    lab: LabValues,
    patient_name: str,
    patient_age: int | None = None,
) -> tuple[AIAnalysis, dict[str, str]]:
    """
    Returns (AIAnalysis, explanations_dict).
    Falls back gracefully if the API call fails.
    """
    if not settings.anthropic_api_key:
        logger.warning("ANTHROPIC_API_KEY not set — returning fallback analysis")
        return _fallback()

    prompt = _build_prompt(lab, patient_name, patient_age)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                ANTHROPIC_URL,
                headers={
                    "x-api-key":         settings.anthropic_api_key,
                    "anthropic-version":  "2023-06-01",
                    "content-type":       "application/json",
                },
                json={
                    "model":      MODEL,
                    "max_tokens": 1200,
                    "messages":   [{"role": "user", "content": prompt}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            raw  = "".join(
                block.get("text", "")
                for block in data.get("content", [])
                if block.get("type") == "text"
            )
            parsed = json.loads(raw.strip())
            return _parse_response(parsed)

    except httpx.HTTPStatusError as e:
        logger.error("Anthropic API HTTP error %s: %s", e.response.status_code, e.response.text)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse Anthropic JSON response: %s", e)
    except Exception as e:
        logger.error("Unexpected AI service error: %s", e)

    return _fallback()


def _parse_response(parsed: dict) -> tuple[AIAnalysis, dict[str, str]]:
    explanations: dict[str, str] = parsed.get("explanations", {})
    analysis = AIAnalysis(
        summary    = parsed.get("summary", ""),
        conditions = parsed.get("conditions", []),
        specialists= parsed.get("specialists", []),
        tips       = parsed.get("tips", []),
    )
    return analysis, explanations


def _fallback() -> tuple[AIAnalysis, dict[str, str]]:
    return (
        AIAnalysis(
            summary     = "AI analysis is currently unavailable. Please consult a medical professional.",
            conditions  = [],
            specialists = ["General Physician"],
            tips        = [
                "Maintain a balanced diet rich in fruits, vegetables, and whole grains.",
                "Exercise for at least 30 minutes most days of the week.",
                "Schedule regular check-ups with your healthcare provider.",
            ],
        ),
        {},
    )
