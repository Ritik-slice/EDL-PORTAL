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
    await db.commit()
    await db.refresh(doc)

    return {
        "id": doc.id,
        "case_id": case_id,
        "doc_type": doc.doc_type.value,
        "filename": doc.original_filename,
        "parse_status": doc.parse_status.value,
        "extraction_confidence": doc.extraction_confidence,
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
