"""
Document upload endpoint.
Accepts file upload, stores to S3 (or local in dev), triggers async parsing.
"""
import uuid
from datetime import datetime, timezone
from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.case import Case, CaseStatus
from app.models.document import Document, DocumentType, ParseStatus
from app.models.user import User
from app.core.config import settings
from app.services.parsers.bank_statement_parser import parse_bank_statement
from app.services.parsers.gst_parser import parse_gst_return
from app.services.parsers.financial_statement_parser import parse_financial_statement
from app.services.parsers.bureau_parser import parse_bureau_report

import dataclasses, json
from sqlalchemy.orm.attributes import flag_modified
from loguru import logger

router = APIRouter(prefix="/cases/{case_id}/documents", tags=["documents"])


def _to_json(obj) -> dict:
    """Convert dataclass to JSON-serialisable dict."""
    if dataclasses.is_dataclass(obj):
        result = {}
        for f in dataclasses.fields(obj):
            val = getattr(obj, f.name)
            result[f.name] = _to_json(val)
        return result
    elif isinstance(obj, list):
        return [_to_json(i) for i in obj]
    elif isinstance(obj, datetime):
        return obj.isoformat()
    else:
        return obj


async def _store_file(content: bytes, s3_key: str) -> str:
    """In dev, store locally. In prod, upload to S3."""
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


def _parse_document(content: bytes, filename: str, doc_type: DocumentType, case: Case) -> dict:
    """Synchronously parse a document and return extracted_data dict."""
    if doc_type == DocumentType.bank_statement:
        result = parse_bank_statement(content, filename)
    elif doc_type == DocumentType.gst_return:
        result = parse_gst_return(content, filename)
    elif doc_type == DocumentType.financial_statement:
        result = parse_financial_statement(
            content, filename,
            loan_amount=case.loan_amount_requested,
            loan_tenor_months=case.loan_tenor_months or 60,
        )
    elif doc_type == DocumentType.bureau_report:
        result = parse_bureau_report(content, filename)
    else:
        return {}

    return _to_json(result)


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_document(
    case_id: str,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate case
    result = await db.execute(select(Case).where(Case.id == case_id))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Validate doc_type
    try:
        dtype = DocumentType(doc_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid doc_type. Valid: {[e.value for e in DocumentType]}")

    content = await file.read()
    s3_key = f"{case_id}/{dtype.value}/{uuid.uuid4()}-{file.filename}"
    await _store_file(content, s3_key)

    doc = Document(
        id=str(uuid.uuid4()),
        case_id=case_id,
        doc_type=dtype,
        original_filename=file.filename,
        s3_key=s3_key,
        file_size_bytes=len(content),
        mime_type=file.content_type,
        parse_status=ParseStatus.processing,
    )
    db.add(doc)
    await db.commit()

    # Parse synchronously (in prod this would be a Celery task)
    try:
        extracted = _parse_document(content, file.filename, dtype, case)
        doc.extracted_data = extracted
        doc.parse_status = ParseStatus.completed
        doc.parsed_at = datetime.now(timezone.utc)
        doc.extraction_confidence = extracted.get("extraction_confidence", 0.8)
        logger.info(f"Document {doc.id} parsed successfully")
    except Exception as e:
        logger.error(f"Parse failed for {doc.id}: {e}")
        doc.parse_status = ParseStatus.failed
        doc.parse_error = str(e)[:2000]

    # Update case status
    case.status = CaseStatus.documents_uploaded

    # Merge parsed data into the CAM if it exists
    fields_updated = []
    if doc.parse_status == ParseStatus.completed and extracted:
        fields_updated = await _merge_into_cam(case_id, dtype, extracted, db, current_user.email)

    await db.commit()
    await db.refresh(doc)

    return {
        "id": doc.id,
        "case_id": case_id,
        "doc_type": doc.doc_type.value,
        "filename": doc.original_filename,
        "parse_status": doc.parse_status.value,
        "extraction_confidence": doc.extraction_confidence,
        "fields_updated": len(fields_updated),
        "updated_fields": fields_updated[:10],  # First 10 for display
    }


@router.get("")
async def list_documents(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(Document.case_id == case_id).order_by(Document.uploaded_at)
    )
    docs = result.scalars().all()
    return [
        {
            "id": d.id, "doc_type": d.doc_type.value,
            "filename": d.original_filename, "parse_status": d.parse_status.value,
            "extraction_confidence": d.extraction_confidence,
            "uploaded_at": d.uploaded_at.isoformat(),
        }
        for d in docs
    ]


async def _merge_into_cam(case_id: str, doc_type: DocumentType, extracted: dict, db: AsyncSession, user_email: str) -> list:
    """
    After a document is parsed, merge extracted data into the CAM document.
    Maps parsed fields to the correct CAM output/section fields.
    Returns list of field names that were updated.
    """
    # Find existing CAM data document
    result = await db.execute(
        select(Document)
        .where(Document.case_id == case_id, Document.parse_status == ParseStatus.completed)
        .order_by(Document.uploaded_at.desc())
    )
    cam_doc = None
    for d in result.scalars().all():
        if d.extracted_data and isinstance(d.extracted_data, dict) and "output" in d.extracted_data:
            cam_doc = d
            break

    if not cam_doc:
        # No CAM yet — create a blank one
        cam_data = {
            "application": {}, "output": {}, "demographic": {},
            "bureau": {"scores": [], "existing_loans": [], "commercial_bureau": {}},
            "banking": {}, "gst": {"auto_pull": {}, "manual_pull": {}, "monthly_filings": []},
            "financials": {}, "aip": {"primary_income": {}, "bills": [], "secondary_income": []},
            "pd_notes": {}, "stock_details": [], "scorecard": {"total_score": None, "risk_band": None, "parameters": []},
            "deviations": [], "interest_rate": {}, "eligibility": {},
            "loan_final": {}, "sanction_conditions": [], "loan_purpose": [],
            "reference_checks": [], "risk_band": {}, "tradeline_summary": [],
            "applicant_summary": [], "editable_fields": [], "edit_history": [],
            "_source": "documents",
        }
        cam_doc = Document(
            id=str(uuid.uuid4()), case_id=case_id, doc_type=DocumentType.other,
            original_filename="cam_generated.json", s3_key=f"{case_id}/cam/generated.json",
            file_size_bytes=0, mime_type="application/json",
            parse_status=ParseStatus.completed, parsed_at=datetime.now(timezone.utc),
            extracted_data=cam_data, extraction_confidence=0.8,
        )
        db.add(cam_doc)
        await db.flush()
    else:
        cam_data = dict(cam_doc.extracted_data)

    updated = []
    now = datetime.now(timezone.utc).isoformat()

    def _set(section: str, key: str, value, source_doc: str = ""):
        """Set a field in the CAM data and track the update."""
        if value is None or value == "" or value == 0:
            return
        if section == "output":
            cam_data.setdefault("output", {})[key] = value
        elif section.startswith("gst."):
            parts = section.split(".", 1)
            cam_data.setdefault("gst", {}).setdefault(parts[1], {})[key] = value
        else:
            cam_data.setdefault(section, {})[key] = value if not isinstance(value, dict) else value
        updated.append({"field": f"{section}.{key}", "value": str(value)[:100], "source": source_doc, "at": now})

    source_name = doc_type.value

    # ── Bank Statement ──
    if doc_type == DocumentType.bank_statement:
        _set("output", "combined_bto", extracted.get("total_credits_12m"), source_name)
        _set("output", "combined_average_bank_balance", extracted.get("average_eod_balance"), source_name)
        _set("output", "combined_net_business_credits", extracted.get("total_credits_12m"), source_name)
        _set("output", "number_of_bank_accounts", 1, source_name)
        avg_monthly = extracted.get("average_monthly_bank_credit")
        if avg_monthly:
            _set("output", "combined_average_bank_balance", extracted.get("average_eod_balance"), source_name)
        bounces = extracted.get("bounce_count_12m")
        if bounces:
            _set("banking", "bounce_count_12m", bounces, source_name)
        emi = extracted.get("emi_obligations_monthly")
        if emi:
            _set("output", "Total_existing_EMI_of_All_loans", round(emi * 12), source_name)
            _set("output", "total_obligated_EMI", round(emi), source_name)
        # Monthly summaries
        monthly = extracted.get("monthly_summaries", [])
        if monthly:
            cam_data.setdefault("banking", {})["monthly_summaries"] = monthly

    # ── GST Return ──
    elif doc_type == DocumentType.gst_return:
        _set("gst.manual_pull", "gstin", extracted.get("gstin"), source_name)
        _set("gst.manual_pull", "status", "Active" if extracted.get("filing_regularity_pct", 0) > 50 else "Irregular", source_name)
        entries = extracted.get("entries", [])
        if entries:
            _set("gst.manual_pull", "latest_month", entries[-1].get("period"), source_name)
            _set("gst.manual_pull", "frequency", "Monthly" if len(entries) >= 6 else "Quarterly", source_name)
            total_turnover = extracted.get("total_turnover_annual")
            if total_turnover:
                _set("output", "Annual_gst_turnover", total_turnover, source_name)
                _set("output", "GST_status", "Active", source_name)
                _set("output", "gst_filing_frequency", "Monthly" if len(entries) >= 6 else "Quarterly", source_name)
                _set("output", "latest_gst_filed_month", entries[-1].get("period"), source_name)
            # Monthly filings
            filings = [{"month": e.get("period"), "fy": "", "amount": e.get("turnover"), "source": "document", "editable": True} for e in entries]
            cam_data.setdefault("gst", {})["monthly_filings"] = filings

    # ── Financial Statement ──
    elif doc_type == DocumentType.financial_statement:
        pnl_list = extracted.get("pnl", [])
        bs_list = extracted.get("balance_sheets", [])
        ratios_list = extracted.get("ratios", [])
        if pnl_list:
            if len(pnl_list) >= 2:
                prev, curr = pnl_list[-2], pnl_list[-1]
            else:
                prev, curr = pnl_list[0], pnl_list[0]
            _set("output", "turnover_previous_year", prev.get("revenue"), source_name)
            _set("output", "turnover_current_year", curr.get("revenue"), source_name)
            _set("output", "gross_profit_previous_year", prev.get("gross_profit"), source_name)
            _set("output", "gross_profit_current_year", curr.get("gross_profit"), source_name)
            _set("output", "profit_after_taxes_previous_year", prev.get("pat"), source_name)
            _set("output", "profit_after_taxes_current_year", curr.get("pat"), source_name)
        if bs_list:
            if len(bs_list) >= 2:
                prev_bs, curr_bs = bs_list[-2], bs_list[-1]
            else:
                prev_bs, curr_bs = bs_list[0], bs_list[0]
            _set("output", "current_assets_previous_year", prev_bs.get("total_current_assets"), source_name)
            _set("output", "current_assets_current_year", curr_bs.get("total_current_assets"), source_name)
            _set("output", "non_current_assets_previous_year", prev_bs.get("fixed_assets_net"), source_name)
            _set("output", "non_current_assets_current_year", curr_bs.get("fixed_assets_net"), source_name)
            _set("output", "current_liabilities_previous_year", prev_bs.get("total_current_liabilities"), source_name)
            _set("output", "current_liabilities_current_year", curr_bs.get("total_current_liabilities"), source_name)
            _set("output", "capital_previous_year", prev_bs.get("net_worth"), source_name)
            _set("output", "capital_current_year", curr_bs.get("net_worth"), source_name)
        if ratios_list:
            latest_ratio = ratios_list[-1]
            _set("output", "Eligibility_as_per_Company_Financials", latest_ratio.get("dscr"), source_name)

    # ── Bureau Report ──
    elif doc_type == DocumentType.bureau_report:
        score = extracted.get("score")
        if score and score > 0:
            cam_data.setdefault("bureau", {}).setdefault("scores", []).append({
                "applicant_index": "0", "type": "Co Borrower",
                "name": extracted.get("borrower_name", "Applicant"),
                "provider": extracted.get("bureau_name", "Bureau"),
                "score": score, "fetch_date": now, "ntc_flag": False,
            })
            _set("output", "Commercial_bureau_score", score, source_name)
        accounts = extracted.get("accounts", [])
        for acc in accounts:
            cam_data.setdefault("bureau", {}).setdefault("existing_loans", []).append({
                "borrower": "Applicant", "financier": acc.get("lender"),
                "loan_type": acc.get("account_type"), "amount": acc.get("sanctioned_amount"),
                "pos": acc.get("current_balance"), "emi_assessed": acc.get("emi"),
                "term": None, "mob": None, "obligated": True,
            })
        total_emi = sum(a.get("emi", 0) for a in accounts if a.get("emi"))
        if total_emi:
            _set("output", "Total_existing_EMI_of_All_loans", total_emi, source_name)

    # ── ITR ──
    elif doc_type == DocumentType.itr:
        _set("output", "itr_income_previous_year", extracted.get("business_income"), source_name)

    # Track update history
    if "edit_history" not in cam_data:
        cam_data["edit_history"] = []
    for u in updated:
        cam_data["edit_history"].append({
            "field": u["field"], "new_value": u["value"],
            "source": f"Document: {source_name}", "updated_by": user_email, "updated_at": now,
        })

    cam_doc.extracted_data = cam_data
    flag_modified(cam_doc, "extracted_data")

    logger.info(f"Merged {len(updated)} fields from {source_name} into CAM for case {case_id}")
    return [u["field"] for u in updated]
