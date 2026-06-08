"""
CAM XLSM upload, retrieval, and field editing endpoints.
Handles .xlsm CAM files from Slice's lending platform.
"""
import uuid
from datetime import datetime, timezone
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.case import Case, CaseStatus
from app.models.document import Document, DocumentType, ParseStatus
from app.models.user import User
from app.core.config import settings

from loguru import logger
import json

router = APIRouter(prefix="/cases/{case_id}", tags=["cam-xlsm"])


def _make_json_serializable(obj):
    """Recursively convert datetime and other non-JSON types to strings."""
    if isinstance(obj, dict):
        return {k: _make_json_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_make_json_serializable(v) for v in obj]
    elif isinstance(obj, datetime):
        return obj.isoformat()
    elif hasattr(obj, '__class__') and obj.__class__.__name__ in ('date', 'time', 'timedelta'):
        return str(obj)
    elif isinstance(obj, (bytes, bytearray)):
        return obj.decode('utf-8', errors='replace')
    elif isinstance(obj, float) and (obj != obj):  # NaN check
        return None
    return obj


async def _store_file(content: bytes, s3_key: str) -> str:
    if settings.is_dev:
        import os
        local_path = f"/tmp/cam-docs/{s3_key}"
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(content)
        return s3_key
    else:
        import boto3
        s3 = boto3.client("s3", region_name=settings.AWS_REGION)
        s3.put_object(Bucket=settings.S3_BUCKET, Key=s3_key, Body=content)
        return s3_key


@router.post("/upload-cam", status_code=status.HTTP_201_CREATED)
async def upload_cam_xlsm(
    case_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a .xlsm CAM file, parse all sheets, store structured data."""
    # Validate case
    result = await db.execute(select(Case).where(Case.id == case_id))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Validate file type
    filename = file.filename or "cam.xlsm"
    if not filename.lower().endswith((".xlsm", ".xlsx")):
        raise HTTPException(status_code=400, detail="Only .xlsm and .xlsx files are supported")

    content = await file.read()
    s3_key = f"{case_id}/cam_xlsm/{uuid.uuid4()}-{filename}"
    await _store_file(content, s3_key)

    # Create document record
    doc = Document(
        id=str(uuid.uuid4()),
        case_id=case_id,
        doc_type=DocumentType.other,
        original_filename=filename,
        s3_key=s3_key,
        file_size_bytes=len(content),
        mime_type="application/vnd.ms-excel.sheet.macroEnabled.12",
        parse_status=ParseStatus.processing,
    )
    db.add(doc)
    await db.commit()

    # Parse the XLSM
    try:
        from app.services.parsers.cam_xlsm_parser import parse_cam_xlsm
        cam_data = parse_cam_xlsm(content, filename)
        cam_data = _make_json_serializable(cam_data)

        doc.extracted_data = cam_data
        doc.parse_status = ParseStatus.completed
        doc.parsed_at = datetime.now(timezone.utc)
        doc.extraction_confidence = cam_data.get("_meta", {}).get("confidence", 0.85)

        # Update case with key info from CAM
        output = cam_data.get("output", {})
        app_info = cam_data.get("application", {})

        case.borrower_name = app_info.get("applicant_name") or case.borrower_name
        case.borrower_pan = app_info.get("pan") or case.borrower_pan
        case.borrower_gstin = app_info.get("gstin") or case.borrower_gstin
        case.loan_amount_requested = output.get("requested_loan_amount") or case.loan_amount_requested
        case.status = CaseStatus.cam_ready

        # Store risk signals summary
        scorecard = cam_data.get("scorecard", {})
        loan_final = cam_data.get("loan_final", {})
        bureau_scores = cam_data.get("bureau", {}).get("scores", [])
        # Find the first entry with a numeric score
        primary_score = None
        for bs in bureau_scores:
            s = bs.get("score") or bs.get("provider")
            try:
                primary_score = int(float(s))
                break
            except (ValueError, TypeError):
                continue

        case.risk_signals = {
            "risk_grade": _score_to_grade(scorecard.get("total_score", 0)),
            "recommendation": "approve" if output.get("Final_Sanctioned_Amount") and str(output.get("Final_Sanctioned_Amount")) != "Reject" else "decline",
            "dscr": None,
            "bureau_score": primary_score,
            "total_score": scorecard.get("total_score"),
            "score_risk_band": scorecard.get("risk_band"),
            "final_loan_amount": loan_final.get("amount"),
            "final_emi": loan_final.get("emi"),
            "final_rate": loan_final.get("interest_rate"),
            "final_foir": output.get("Final_FOIR"),
            "flags": [],
        }

        case.financial_summary = {
            "annual_assessed_sales": output.get("annual_assessed_sales"),
            "combined_bto": output.get("combined_bto"),
            "combined_avg_balance": output.get("combined_average_bank_balance"),
            "total_obligated_emi": output.get("total_obligated_EMI"),
        }

        logger.info(f"CAM XLSM parsed for case {case_id}: {len(cam_data.get('editable_fields', []))} editable fields found")

    except Exception as e:
        logger.error(f"CAM XLSM parse failed for {doc.id}: {e}")
        import traceback
        traceback.print_exc()
        doc.parse_status = ParseStatus.failed
        doc.parse_error = str(e)[:2000]

    await db.commit()
    await db.refresh(doc)

    if doc.parse_status == ParseStatus.failed:
        raise HTTPException(status_code=422, detail=f"Failed to parse CAM file: {doc.parse_error}")

    return {
        "document_id": doc.id,
        "case_id": case_id,
        "filename": filename,
        "parse_status": doc.parse_status.value,
        "sheets_parsed": cam_data.get("_meta", {}).get("sheets_parsed", []),
        "editable_fields_count": len(cam_data.get("editable_fields", [])),
    }


@router.get("/cam-data")
async def get_cam_data(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the full parsed CAM data for a case."""
    result = await db.execute(
        select(Document)
        .where(
            Document.case_id == case_id,
            Document.parse_status == ParseStatus.completed,
            Document.original_filename.like("%.xlsm"),
        )
        .order_by(Document.uploaded_at.desc())
    )
    doc = result.scalars().first()

    if not doc:
        # Fallback: try .xlsx
        result = await db.execute(
            select(Document)
            .where(
                Document.case_id == case_id,
                Document.parse_status == ParseStatus.completed,
                Document.original_filename.like("%.xlsx"),
            )
            .order_by(Document.uploaded_at.desc())
        )
        doc = result.scalars().first()

    if not doc or not doc.extracted_data:
        raise HTTPException(status_code=404, detail="No parsed CAM data found. Upload a .xlsm CAM file first.")

    return doc.extracted_data


@router.patch("/cam-data")
async def update_cam_field(
    case_id: str,
    updates: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update editable (yellow) fields in the CAM data.
    Body: { "field_path": "new_value", ... }
    field_path uses dot notation: "output.Final_Sanctioned_Amount" or "pd_notes.borrower_profile"
    """
    result = await db.execute(
        select(Document)
        .where(
            Document.case_id == case_id,
            Document.parse_status == ParseStatus.completed,
        )
        .order_by(Document.uploaded_at.desc())
    )
    doc = result.scalars().first()
    if not doc or not doc.extracted_data:
        raise HTTPException(status_code=404, detail="No parsed CAM data found")

    cam_data = dict(doc.extracted_data)
    editable_keys = {f.get("key") for f in cam_data.get("editable_fields", [])}

    updated_fields = []
    rejected_fields = []

    for field_path, new_value in updates.items():
        # Navigate dot-notation path
        parts = field_path.split(".")
        target = cam_data
        for part in parts[:-1]:
            if isinstance(target, dict):
                target = target.get(part, {})
            elif isinstance(target, list):
                try:
                    target = target[int(part)]
                except (ValueError, IndexError):
                    target = {}
                    break

        final_key = parts[-1]
        if isinstance(target, dict):
            old_value = target.get(final_key)
            target[final_key] = new_value
            updated_fields.append({
                "field": field_path,
                "old_value": old_value,
                "new_value": new_value,
                "updated_by": current_user.email,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
        else:
            rejected_fields.append({"field": field_path, "reason": "Invalid path"})

    # Track edit history
    if "edit_history" not in cam_data:
        cam_data["edit_history"] = []
    cam_data["edit_history"].extend(updated_fields)

    doc.extracted_data = cam_data

    # Use flag_modified to ensure SQLAlchemy detects JSON change
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(doc, "extracted_data")

    await db.commit()

    return {
        "updated": len(updated_fields),
        "rejected": len(rejected_fields),
        "details": updated_fields,
        "rejected_details": rejected_fields,
    }


@router.get("/cam-data/editable")
async def get_editable_fields(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get only the editable (yellow) fields for the CAM."""
    result = await db.execute(
        select(Document)
        .where(
            Document.case_id == case_id,
            Document.parse_status == ParseStatus.completed,
        )
        .order_by(Document.uploaded_at.desc())
    )
    doc = result.scalars().first()
    if not doc or not doc.extracted_data:
        raise HTTPException(status_code=404, detail="No parsed CAM data found")

    return {
        "editable_fields": doc.extracted_data.get("editable_fields", []),
        "edit_history": doc.extracted_data.get("edit_history", []),
    }


@router.get("/cam-data/history")
async def get_edit_history(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the edit history (audit trail) for a CAM."""
    result = await db.execute(
        select(Document)
        .where(
            Document.case_id == case_id,
            Document.parse_status == ParseStatus.completed,
        )
        .order_by(Document.uploaded_at.desc())
    )
    doc = result.scalars().first()
    if not doc or not doc.extracted_data:
        raise HTTPException(status_code=404, detail="No parsed CAM data found")

    return {"history": doc.extracted_data.get("edit_history", [])}


def _score_to_grade(score) -> str:
    if score is None:
        return "B"
    try:
        score = float(score)
    except (ValueError, TypeError):
        return "B"
    if score >= 80:
        return "A"
    elif score >= 65:
        return "B"
    elif score >= 50:
        return "C"
    return "D"
