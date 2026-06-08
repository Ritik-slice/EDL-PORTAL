"""
Slice API integration routes.
Fetch applicant data from Slice APIs by app_id, populate CAM data.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.case import Case, CaseStatus
from app.models.document import Document, DocumentType, ParseStatus
from app.models.user import User
from app.core.config import settings
from app.services.slice_api import SliceAPIClient, SliceAuthError, SliceAPIError

from loguru import logger

router = APIRouter(prefix="/slice", tags=["slice-integration"])


class FetchByAppIdRequest(BaseModel):
    app_id: str
    access_token: str | None = None  # Optional override token


class VKYCRequest(BaseModel):
    uuid: str
    mobile: str
    name: str
    vkyc_type: str = "business_kyc"


def _make_json_safe(obj):
    """Recursively convert non-JSON-serializable types."""
    if isinstance(obj, dict):
        return {k: _make_json_safe(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_make_json_safe(v) for v in obj]
    elif isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, (bytes, bytearray)):
        return obj.decode("utf-8", errors="replace")
    elif isinstance(obj, float) and obj != obj:  # NaN
        return None
    return obj


def _transform_to_cam_format(raw: dict) -> dict:
    """
    Transform raw Slice API responses into the same CAM data structure
    that the XLSM parser produces, so the frontend renders it identically.
    """
    app_id = raw.get("_app_id", "")
    biz = raw.get("business_details") or {}
    app_data = raw.get("application") or {}
    aa = raw.get("account_aggregator") or {}
    elig = raw.get("eligibility") or {}
    bureau_raw = raw.get("bureau") or {}
    gst_raw = raw.get("gst") or {}

    # Flatten nested API responses — each API has its own schema
    # We extract what we can and map to CAM fields
    biz_data = biz.get("data", biz)
    app_details = app_data.get("data", app_data)
    aa_data = aa.get("data", aa)
    elig_data = elig.get("data", elig)
    bureau_data = bureau_raw.get("data", bureau_raw)
    gst_data = gst_raw.get("data", gst_raw)

    # ── Application ──────────────────────────────────────────────────────
    application = {
        "app_id": app_id,
        "applied_date": _deep_get(app_details, "applicationDetails.application_created_at")
            or _deep_get(app_details, "createdAt"),
        "branch": _deep_get(app_details, "applicationDetails.branchName")
            or _deep_get(app_details, "branchName"),
        "loan_amount": _deep_get(app_details, "applicationDetails.loanAmount")
            or _deep_get(app_details, "loanAmount")
            or _deep_get(elig_data, "requestedLoanAmount"),
        "loan_type": _deep_get(app_details, "applicationDetails.loanType")
            or _deep_get(app_details, "loanType"),
        "applicant_name": _deep_get(app_details, "applicantDetails.applicantName")
            or _deep_get(app_details, "applicantName")
            or _deep_get(biz_data, "applicantName"),
        "mobile": _deep_get(app_details, "applicantDetails.mobileNumber"),
        "email": _deep_get(app_details, "applicantDetails.emailId"),
        "dob": _deep_get(app_details, "applicantDetails.dateOfBirth"),
        "age": _deep_get(app_details, "applicantDetails.age"),
        "pan": _deep_get(app_details, "applicantDetails.pan")
            or _deep_get(biz_data, "pan"),
        "pan_status": _deep_get(app_details, "applicantDetails.panStatus"),
        "occupation": _deep_get(app_details, "applicantDetails.occupation"),
        "current_address": _deep_get(app_details, "applicantDetails.currentAddress"),
        "business_name": _deep_get(biz_data, "businessName")
            or _deep_get(biz_data, "udyamDetails.details.name"),
        "gstin": _deep_get(biz_data, "gstNumber")
            or _deep_get(biz_data, "gstin"),
        "udyam_number": _deep_get(biz_data, "udyamNumber")
            or _deep_get(biz_data, "udyamDetails.details.documentId"),
        "constitution": _deep_get(biz_data, "constitution")
            or _deep_get(biz_data, "udyamDetails.details.organizationType"),
        "nature_of_business": _deep_get(biz_data, "natureOfBusiness")
            or _deep_get(biz_data, "udyamDetails.details.majorActivity"),
        "business_type": _deep_get(biz_data, "businessType")
            or _deep_get(biz_data, "udyamDetails.details.nic_4_digit"),
        "business_address": _deep_get(biz_data, "businessAddress")
            or _deep_get(biz_data, "udyamDetails.details.address"),
        "enterprise_type": _deep_get(biz_data, "enterpriseType"),
        "annual_turnover": _deep_get(biz_data, "annualTurnover"),
        "monthly_sales": _deep_get(biz_data, "monthlySales"),
        "current_stock_value": _deep_get(biz_data, "currentStockValue"),
        "primary_security": _deep_get(biz_data, "primarySecurity"),
        "secondary_security": _deep_get(biz_data, "secondarySecurity"),
    }

    # ── Output (key metrics) ──────────────────────────────────────────────
    output = {
        "requested_loan_amount": application.get("loan_amount"),
        "requested_loan_type": application.get("loan_type"),
        "Nature_of_business": application.get("nature_of_business"),
        "business_type": application.get("business_type"),
        "business_constitution": application.get("constitution"),
        # Banking
        "number_of_bank_accounts": _deep_get(aa_data, "numberOfBankAccounts")
            or _deep_get(aa_data, "bankAccounts.length"),
        "combined_average_bank_balance": _deep_get(aa_data, "combinedAverageBankBalance")
            or _deep_get(aa_data, "averageBankBalance"),
        "combined_bto": _deep_get(aa_data, "combinedBto")
            or _deep_get(aa_data, "bankTurnover"),
        "combined_net_business_credits": _deep_get(aa_data, "combinedNetBusinessCredits"),
        # Eligibility
        "Eligibility_as_per_Bank_Account": _deep_get(elig_data, "bankAccountEligibility")
            or _deep_get(elig_data, "eligibilityBankAccount"),
        "Eligibility_as_per_GST_Return": _deep_get(elig_data, "gstEligibility")
            or _deep_get(elig_data, "eligibilityGst"),
        "Eligibility_as_per_ITR": _deep_get(elig_data, "itrEligibility"),
        "Eligibility_as_per_Income_Assessment": _deep_get(elig_data, "incomeAssessmentEligibility"),
        "Maximum_Eligibility_as_per_FOIR": _deep_get(elig_data, "maxFoirEligibility"),
        "Eligibility_as_per_Security": _deep_get(elig_data, "securityEligibility"),
        "Recommended_Loan_Amount_as_per_Underwriter": _deep_get(elig_data, "recommendedLoanAmount"),
        "Final_Sanctioned_Amount": _deep_get(elig_data, "sanctionedAmount")
            or _deep_get(elig_data, "finalSanctionedAmount"),
        "Final_Tenure": _deep_get(elig_data, "tenure")
            or _deep_get(elig_data, "finalTenure"),
        "Final_Interest_Rate": _deep_get(elig_data, "interestRate")
            or _deep_get(elig_data, "finalInterestRate"),
        "Final_Proposed_Loan": _deep_get(elig_data, "emiAmount"),
        "Final_FOIR": _deep_get(elig_data, "foir")
            or _deep_get(elig_data, "finalFoir"),
        "Final_ABB/EMI_ratio": _deep_get(elig_data, "abbEmiRatio"),
        "Income_Program_for_Eligbility": _deep_get(elig_data, "incomeProgram"),
        # Bureau
        "total_score_obtained": _deep_get(bureau_data, "totalScore")
            or _deep_get(bureau_data, "scorecard.totalScore"),
        "score_risk_band": _deep_get(bureau_data, "riskBand")
            or _deep_get(bureau_data, "scorecard.riskBand"),
    }

    # ── Bureau ────────────────────────────────────────────────────────────
    bureau_scores = []
    applicants = bureau_data.get("applicants") or bureau_data.get("scores") or []
    if isinstance(applicants, list):
        for a in applicants:
            bureau_scores.append({
                "applicant_index": a.get("applicantIndex"),
                "type": a.get("applicantType") or a.get("type"),
                "name": a.get("name") or a.get("fullName"),
                "provider": a.get("provider") or a.get("bureauProvider"),
                "score": a.get("score") or a.get("bureauScore"),
                "fetch_date": a.get("fetchDate"),
                "ntc_flag": a.get("ntcFlag"),
            })

    existing_loans = []
    tradelines = bureau_data.get("tradelines") or bureau_data.get("existingLoans") or []
    if isinstance(tradelines, list):
        for t in tradelines:
            existing_loans.append({
                "financier": t.get("creditorName") or t.get("financier"),
                "loan_type": t.get("accountType") or t.get("loanType"),
                "amount": t.get("sanctionedAmount") or t.get("amount"),
                "pos": t.get("currentBalance") or t.get("pos"),
                "emi": t.get("emiAmount") or t.get("emi"),
                "term": t.get("tenure") or t.get("term"),
                "mob": t.get("mob"),
                "status": t.get("accountStatus") or t.get("status"),
            })

    bureau = {
        "scores": bureau_scores,
        "existing_loans": existing_loans,
        "commercial_bureau": {},
    }

    # ── Banking ───────────────────────────────────────────────────────────
    banking = {}
    if aa_data:
        bank_accounts = aa_data.get("bankAccounts") or aa_data.get("accounts") or []
        banking = {
            "accounts": bank_accounts if isinstance(bank_accounts, list) else [],
            "summary": {
                "average_balance": _deep_get(aa_data, "combinedAverageBankBalance")
                    or _deep_get(aa_data, "averageBankBalance"),
                "total_credits": _deep_get(aa_data, "combinedBto")
                    or _deep_get(aa_data, "totalCredits"),
                "net_business_credits": _deep_get(aa_data, "combinedNetBusinessCredits"),
            },
        }

    # ── GST ───────────────────────────────────────────────────────────────
    gst = {
        "auto_pull": gst_data if isinstance(gst_data, dict) else {},
        "manual_pull": {},
        "monthly_filings": [],
    }
    gst_filings = gst_data.get("filings") or gst_data.get("monthlyData") or []
    if isinstance(gst_filings, list):
        gst["monthly_filings"] = [
            {"month": f.get("month"), "fy": f.get("fy") or f.get("financialYear"), "amount": f.get("amount") or f.get("turnover")}
            for f in gst_filings
        ]

    # ── Eligibility ───────────────────────────────────────────────────────
    eligibility = {}
    if elig_data and isinstance(elig_data, dict):
        eligibility = elig_data

    # ── Combine everything into CAM format ─────────────────────────────────
    cam_data = {
        "application": application,
        "output": output,
        "demographic": {},
        "bureau": bureau,
        "banking": banking,
        "gst": gst,
        "financials": {},
        "aip": {"primary_income": {}, "bills": [], "secondary_income": []},
        "pd_notes": {},
        "stock_details": [],
        "scorecard": {
            "total_score": output.get("total_score_obtained"),
            "risk_band": output.get("score_risk_band"),
            "parameters": [],
        },
        "deviations": [],
        "interest_rate": {},
        "eligibility": eligibility,
        "loan_final": {
            "amount": output.get("Final_Sanctioned_Amount"),
            "tenure": output.get("Final_Tenure"),
            "interest_rate": output.get("Final_Interest_Rate"),
            "emi": output.get("Final_Proposed_Loan"),
        },
        "sanction_conditions": [],
        "loan_purpose": [],
        "reference_checks": [],
        "risk_band": {},
        "tradeline_summary": [],
        "applicant_summary": [],
        "editable_fields": [],
        # Store raw API responses for debugging
        "_raw_api_responses": {
            "business_details": biz,
            "account_aggregator": aa,
            "eligibility": elig,
            "application": app_data,
            "bureau": bureau_raw,
            "gst": gst_raw,
        },
        "_source": "slice_api",
        "_app_id": app_id,
        "_fetch_errors": raw.get("_errors", []),
    }

    return _make_json_safe(cam_data)


def _deep_get(obj, path, default=None):
    """Navigate nested dict/list by dot-separated path."""
    if not obj or not path:
        return default
    parts = path.split(".")
    current = obj
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list):
            try:
                current = current[int(part)]
            except (ValueError, IndexError):
                return default
        else:
            return default
        if current is None:
            return default
    return current


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/fetch")
async def fetch_by_app_id(
    req: FetchByAppIdRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch all data from Slice APIs for a given app_id.
    Creates a case, fetches data from all APIs, stores as CAM data.
    """
    if not req.access_token and not settings.SLICE_ACCESS_TOKEN:
        raise HTTPException(
            status_code=400,
            detail="No Slice access token configured. Set SLICE_ACCESS_TOKEN in .env or pass access_token in request.",
        )

    client = SliceAPIClient(access_token=req.access_token or None)

    try:
        raw_data = await client.fetch_all(req.app_id)
    except SliceAuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        logger.error(f"Slice API fetch failed: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch from Slice APIs: {str(e)}")

    cam_data = _transform_to_cam_format(raw_data)

    # Create or update case
    app_info = cam_data.get("application", {})
    borrower_name = app_info.get("applicant_name") or f"App {req.app_id}"
    loan_amount = app_info.get("loan_amount") or 0
    try:
        loan_amount = float(loan_amount)
    except (ValueError, TypeError):
        loan_amount = 0

    # Check if case already exists for this app_id
    result = await db.execute(
        select(Case).where(Case.case_ref == f"SLICE-{req.app_id}")
    )
    case = result.scalar_one_or_none()

    if not case:
        case = Case(
            id=str(uuid.uuid4()),
            case_ref=f"SLICE-{req.app_id}",
            borrower_name=borrower_name,
            loan_amount_requested=loan_amount,
            loan_type=app_info.get("loan_type") or "term_loan",
            loan_purpose=app_info.get("nature_of_business"),
            created_by=current_user.id,
            organisation_id=current_user.organisation_id,
            status=CaseStatus.cam_ready,
        )
        db.add(case)
    else:
        case.borrower_name = borrower_name
        case.loan_amount_requested = loan_amount
        case.status = CaseStatus.cam_ready

    case.borrower_pan = app_info.get("pan")
    case.borrower_gstin = app_info.get("gstin")
    case.industry = app_info.get("nature_of_business")

    # Store risk signals
    output = cam_data.get("output", {})
    bureau_scores = cam_data.get("bureau", {}).get("scores", [])
    primary_score = None
    for bs in bureau_scores:
        try:
            primary_score = int(float(bs.get("score", 0)))
            break
        except (ValueError, TypeError):
            continue

    case.risk_signals = {
        "risk_grade": _score_to_grade(output.get("total_score_obtained")),
        "recommendation": "approve" if output.get("Final_Sanctioned_Amount") else "pending",
        "bureau_score": primary_score,
        "total_score": output.get("total_score_obtained"),
        "score_risk_band": output.get("score_risk_band"),
        "final_loan_amount": output.get("Final_Sanctioned_Amount"),
        "final_emi": output.get("Final_Proposed_Loan"),
        "final_rate": output.get("Final_Interest_Rate"),
        "final_foir": output.get("Final_FOIR"),
        "flags": [],
    }

    case.financial_summary = {
        "combined_bto": output.get("combined_bto"),
        "combined_avg_balance": output.get("combined_average_bank_balance"),
    }

    await db.commit()
    await db.refresh(case)

    # Store as document (same as XLSM upload flow)
    doc = Document(
        id=str(uuid.uuid4()),
        case_id=case.id,
        doc_type=DocumentType.other,
        original_filename=f"slice_api_{req.app_id}.json",
        s3_key=f"{case.id}/slice_api/{req.app_id}.json",
        file_size_bytes=0,
        mime_type="application/json",
        parse_status=ParseStatus.completed,
        parsed_at=datetime.now(timezone.utc),
        extracted_data=cam_data,
        extraction_confidence=0.9,
    )
    db.add(doc)
    await db.commit()

    errors = raw_data.get("_errors", [])
    successful = [k for k, v in raw_data.items() if v is not None and not k.startswith("_")]

    return {
        "case_id": case.id,
        "case_ref": case.case_ref,
        "borrower_name": borrower_name,
        "app_id": req.app_id,
        "apis_successful": successful,
        "apis_failed": [e["source"] for e in errors],
        "errors": errors,
    }


@router.post("/vkyc")
async def generate_vkyc(
    req: VKYCRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate a VKYC link for an applicant."""
    client = SliceAPIClient()
    try:
        result = await client.generate_vkyc_link(
            uuid=req.uuid,
            mobile=req.mobile,
            name=req.name,
            vkyc_type=req.vkyc_type,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"VKYC generation failed: {str(e)}")


@router.get("/config")
async def get_slice_config(
    current_user: User = Depends(get_current_user),
):
    """Check Slice API configuration status."""
    return {
        "base_url": settings.SLICE_API_BASE_URL,
        "token_configured": bool(settings.SLICE_ACCESS_TOKEN),
        "vkyc_url": settings.SLICE_VKYC_BASE_URL,
    }


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
