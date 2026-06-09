"""
Seed script: Parse all 11 CAM XLSM files from /data and load into database.
Run: docker compose exec backend python3 seed_data.py
"""
import asyncio
import glob
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Add app to path
sys.path.insert(0, os.path.dirname(__file__))

from app.core.config import settings
from app.db.base import AsyncSessionLocal, Base, engine
from app.models.user import User
from app.models.case import Case, CaseStatus
from app.models.document import Document, DocumentType, ParseStatus
from app.core.security import hash_password
from app.services.parsers.cam_xlsm_parser import parse_cam_xlsm

# Data directory — mounted inside Docker
DATA_DIR = "/app/data" if os.path.exists("/app/data") else os.path.join(os.path.dirname(__file__), "..", "data")


def make_json_safe(obj):
    """Recursively convert non-JSON-serializable types."""
    if isinstance(obj, dict):
        return {k: make_json_safe(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [make_json_safe(v) for v in obj]
    elif isinstance(obj, datetime):
        return obj.isoformat()
    elif hasattr(obj, '__class__') and obj.__class__.__name__ in ('date', 'time', 'timedelta'):
        return str(obj)
    elif isinstance(obj, (bytes, bytearray)):
        return obj.decode('utf-8', errors='replace')
    elif isinstance(obj, float) and obj != obj:
        return None
    return obj


def score_to_grade(score) -> str:
    if score is None:
        return "B"
    try:
        score = float(score)
    except (ValueError, TypeError):
        return "B"
    if score >= 80: return "A"
    elif score >= 65: return "B"
    elif score >= 50: return "C"
    return "D"


# Map document filenames to doc types
DOC_TYPE_MAP = {
    "bank_statement": DocumentType.bank_statement,
    "bank_statements": DocumentType.bank_statement,
    "gst_returns": DocumentType.gst_return,
    "gst_return": DocumentType.gst_return,
    "income_tax_returns": DocumentType.itr,
    "itr": DocumentType.itr,
    "credit_other": DocumentType.bureau_report,
    "loan_statement": DocumentType.other,
    "business_premises": DocumentType.kyc,
    "business_trade_license": DocumentType.kyc,
    "stock_declaration": DocumentType.other,
    "sanction_letter": DocumentType.other,
    "state_transition": DocumentType.other,
    "other_additional_documents": DocumentType.other,
}


def detect_doc_type(filename: str) -> DocumentType:
    fname_lower = filename.lower()
    for prefix, dtype in DOC_TYPE_MAP.items():
        if fname_lower.startswith(prefix):
            return dtype
    return DocumentType.other


async def seed():
    print("=" * 60)
    print("  EDL-SLICE: Seeding database with 11 CAM files")
    print("=" * 60)

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        # Create default user if not exists
        from sqlalchemy import select
        result = await db.execute(select(User).where(User.email == "agent@slice.in"))
        user = result.scalar_one_or_none()
        if not user:
            user = User(
                id=str(uuid.uuid4()),
                email="agent@slice.in",
                full_name="EDL Agent",
                hashed_password=hash_password("slice2024"),
                role="underwriter",
                organisation_id="slice",
            )
            db.add(user)
            await db.commit()
            print(f"Created user: agent@slice.in / slice2024")

        # Also ensure test user has org
        result = await db.execute(select(User).where(User.email == "test@creditlens.in"))
        test_user = result.scalar_one_or_none()
        if test_user and not test_user.organisation_id:
            test_user.organisation_id = "slice"
            await db.commit()

        # Find all app folders
        app_dirs = sorted(glob.glob(os.path.join(DATA_DIR, "app_*")))
        print(f"\nFound {len(app_dirs)} application folders\n")

        for app_dir in app_dirs:
            app_id = os.path.basename(app_dir)
            print(f"{'─' * 50}")
            print(f"Processing: {app_id}")

            # Find CAM XLSM file
            xlsm_files = glob.glob(os.path.join(app_dir, "*.xlsm"))
            xlsm_files = [f for f in xlsm_files if not os.path.basename(f).startswith("~")]
            if not xlsm_files:
                print(f"  ⚠ No XLSM file found, skipping")
                continue

            xlsm_path = xlsm_files[0]
            xlsm_name = os.path.basename(xlsm_path)
            print(f"  CAM file: {xlsm_name}")

            # Parse the CAM
            try:
                with open(xlsm_path, "rb") as f:
                    cam_data = parse_cam_xlsm(f.read(), xlsm_name)
                cam_data = make_json_safe(cam_data)
                print(f"  ✅ Parsed: {len(cam_data.get('output', {}))} output fields, {len(cam_data.get('editable_fields', []))} editable")
            except Exception as e:
                print(f"  ❌ Parse failed: {e}")
                continue

            app_info = cam_data.get("application", {})
            output = cam_data.get("output", {})
            borrower_name = app_info.get("applicant_name") or xlsm_name.split("_")[1] if "_" in xlsm_name else app_id
            loan_amount = output.get("requested_loan_amount") or 0
            try:
                loan_amount = float(loan_amount)
            except (ValueError, TypeError):
                loan_amount = 0

            # Check if case already exists
            result = await db.execute(select(Case).where(Case.case_ref == f"SLICE-{app_id}"))
            existing = result.scalar_one_or_none()
            if existing:
                print(f"  ⏭ Case already exists: {existing.case_ref}")
                continue

            # Create case
            case = Case(
                id=str(uuid.uuid4()),
                case_ref=f"SLICE-{app_id}",
                borrower_name=borrower_name,
                borrower_pan=app_info.get("pan"),
                borrower_gstin=app_info.get("gstin"),
                borrower_entity_type=app_info.get("constitution"),
                industry=app_info.get("nature_of_business") or output.get("Nature_of_business"),
                loan_amount_requested=loan_amount,
                loan_type=output.get("requested_loan_type") or "term_loan",
                loan_purpose=output.get("Nature_of_business"),
                created_by=user.id,
                organisation_id="slice",
                status=CaseStatus.cam_ready,
            )

            # Risk signals
            scorecard = cam_data.get("scorecard", {})
            bureau_scores = cam_data.get("bureau", {}).get("scores", [])
            primary_score = None
            for bs in bureau_scores:
                try:
                    primary_score = int(float(bs.get("score", 0)))
                    break
                except (ValueError, TypeError):
                    continue

            case.risk_signals = {
                "risk_grade": score_to_grade(scorecard.get("total_score")),
                "recommendation": "approve" if output.get("Final_Sanctioned_Amount") and str(output.get("Final_Sanctioned_Amount")) != "Reject" else "decline",
                "bureau_score": primary_score,
                "total_score": scorecard.get("total_score"),
                "score_risk_band": scorecard.get("risk_band"),
                "final_loan_amount": output.get("Final_Sanctioned_Amount"),
                "final_emi": output.get("Final_Proposed_Loan"),
                "final_rate": output.get("Final_Interest_Rate"),
                "final_foir": output.get("Final_FOIR"),
                "flags": [],
            }

            case.financial_summary = {
                "annual_assessed_sales": output.get("annual_assessed_sales"),
                "combined_bto": output.get("combined_bto"),
                "combined_avg_balance": output.get("combined_average_bank_balance"),
                "total_obligated_emi": output.get("total_obligated_EMI"),
            }

            db.add(case)
            await db.flush()

            # Store CAM document
            cam_doc = Document(
                id=str(uuid.uuid4()),
                case_id=case.id,
                doc_type=DocumentType.other,
                original_filename=xlsm_name,
                s3_key=f"{case.id}/cam_xlsm/{xlsm_name}",
                file_size_bytes=os.path.getsize(xlsm_path),
                mime_type="application/vnd.ms-excel.sheet.macroEnabled.12",
                parse_status=ParseStatus.completed,
                parsed_at=datetime.now(timezone.utc),
                extracted_data=cam_data,
                extraction_confidence=0.85,
            )
            db.add(cam_doc)

            # Index supporting documents
            docs_dir = os.path.join(app_dir, "documents")
            if os.path.isdir(docs_dir):
                doc_files = [f for f in os.listdir(docs_dir) if not f.startswith(".")]
                for doc_file in doc_files:
                    doc_path = os.path.join(docs_dir, doc_file)
                    if os.path.isdir(doc_path):
                        continue
                    doc_type = detect_doc_type(doc_file)
                    doc = Document(
                        id=str(uuid.uuid4()),
                        case_id=case.id,
                        doc_type=doc_type,
                        original_filename=doc_file,
                        s3_key=f"{case.id}/documents/{doc_file}",
                        file_size_bytes=os.path.getsize(doc_path),
                        mime_type="application/octet-stream",
                        parse_status=ParseStatus.completed,
                        parsed_at=datetime.now(timezone.utc),
                        extracted_data={"source": "uploaded_document", "filename": doc_file, "doc_category": doc_type.value},
                        extraction_confidence=0.8,
                    )
                    db.add(doc)
                print(f"  📄 Indexed {len(doc_files)} supporting documents")

            loan_final = cam_data.get("loan_final", {})
            sanctioned = output.get("Final_Sanctioned_Amount", "—")
            print(f"  👤 {borrower_name}")
            print(f"  💰 Requested: ₹{loan_amount:,.0f} | Sanctioned: {sanctioned}")
            print(f"  📊 Bureau: {primary_score} | Score: {scorecard.get('total_score')} | Grade: {case.risk_signals['risk_grade']}")

            await db.commit()

        # Summary
        result = await db.execute(select(Case).where(Case.organisation_id == "slice"))
        all_cases = result.scalars().all()
        print(f"\n{'=' * 60}")
        print(f"  SEEDING COMPLETE: {len(all_cases)} total cases in database")
        print(f"{'=' * 60}")
        for c in all_cases:
            rs = c.risk_signals or {}
            print(f"  {c.case_ref:30s} | {c.borrower_name:30s} | Grade {rs.get('risk_grade', '?')} | ₹{c.loan_amount_requested:>12,.0f}")


if __name__ == "__main__":
    asyncio.run(seed())
