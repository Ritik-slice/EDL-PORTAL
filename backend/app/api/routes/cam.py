"""
CAM generation endpoint.
Reads all parsed documents for a case, runs cross-validation, generates the CAM.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.case import Case, CaseStatus
from app.models.document import Document, DocumentType, ParseStatus
from app.models.cam_report import CAMReport, RecommendationType
from app.models.user import User
from app.services.validators.cross_validator import run_cross_validation
from app.services.generators.cam_generator import generate_cam
from app.services.parsers.bank_statement_parser import BankStatementResult
from app.services.parsers.gst_parser import GSTResult
from app.services.parsers.financial_statement_parser import FinancialStatementResult
from app.services.parsers.bureau_parser import BureauResult

from loguru import logger
import dataclasses

router = APIRouter(prefix="/cases/{case_id}/cam", tags=["cam"])


def _reconstruct(data: dict, cls):
    """Best-effort reconstruct a dataclass from a stored JSON dict."""
    if not data:
        return None
    try:
        fields = {f.name for f in dataclasses.fields(cls)}
        filtered = {k: v for k, v in data.items() if k in fields}
        return cls(**filtered)
    except Exception as e:
        logger.warning(f"Could not reconstruct {cls.__name__}: {e}")
        return None


@router.post("", status_code=201)
async def generate_cam_report(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Load case
    case_result = await db.execute(select(Case).where(Case.id == case_id))
    case = case_result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Load all completed documents
    docs_result = await db.execute(
        select(Document).where(
            Document.case_id == case_id,
            Document.parse_status == ParseStatus.completed,
        )
    )
    docs = docs_result.scalars().all()

    if not docs:
        raise HTTPException(status_code=400, detail="No successfully parsed documents found. Upload and parse documents first.")

    # Reconstruct parser results from stored JSON
    bank = gst = financials = bureau = None

    for doc in docs:
        data = doc.extracted_data or {}
        if doc.doc_type == DocumentType.bank_statement:
            bank = _reconstruct_bank(data)
        elif doc.doc_type == DocumentType.gst_return:
            gst = _reconstruct_gst(data)
        elif doc.doc_type == DocumentType.financial_statement:
            financials = _reconstruct_financials(data)
        elif doc.doc_type == DocumentType.bureau_report:
            bureau = _reconstruct_bureau(data)

    # Run cross-validation
    logger.info(f"Running cross-validation for case {case_id}")
    signals = run_cross_validation(
        bank=bank, gst=gst, financials=financials, bureau=bureau,
        loan_amount=case.loan_amount_requested,
        loan_tenor_months=case.loan_tenor_months or 60,
    )

    # Generate CAM sections
    logger.info(f"Generating CAM for case {case_id}")
    cam_sections = generate_cam(
        borrower_name=case.borrower_name,
        loan_amount=case.loan_amount_requested,
        loan_purpose=case.loan_purpose or "",
        loan_type=case.loan_type.value if hasattr(case.loan_type, "value") else str(case.loan_type),
        loan_tenor_months=case.loan_tenor_months or 60,
        signals=signals,
        bank=bank, gst=gst, financials=financials, bureau=bureau,
    )

    # Determine recommendation enum
    rec_map = {
        "approve": RecommendationType.approve,
        "decline": RecommendationType.decline,
        "refer": RecommendationType.refer,
    }
    recommendation_enum = rec_map.get(cam_sections.recommendation, RecommendationType.refer)

    # Count existing versions
    existing = await db.execute(select(CAMReport).where(CAMReport.case_id == case_id))
    version = len(existing.scalars().all()) + 1

    # Store CAM report
    cam_report = CAMReport(
        id=str(uuid.uuid4()),
        case_id=case_id,
        version=version,
        executive_summary=cam_sections.executive_summary,
        borrower_profile=cam_sections.borrower_profile,
        financial_analysis=cam_sections.financial_analysis,
        banking_behaviour=cam_sections.banking_behaviour,
        gst_compliance=cam_sections.gst_compliance,
        bureau_summary=cam_sections.bureau_summary,
        risk_flags=cam_sections.risk_flags,
        proposed_structure=cam_sections.proposed_structure,
        recommendation=recommendation_enum,
        recommendation_rationale=cam_sections.recommendation_rationale,
    )
    db.add(cam_report)

    # Store risk signals and update case status
    case.risk_signals = {
        "risk_grade": signals.risk_grade,
        "recommendation": signals.recommendation,
        "dscr": signals.dscr,
        "bureau_score": signals.bureau_score,
        "bounce_count_12m": signals.bounce_count_12m,
        "gst_bank_match_pct": signals.gst_bank_turnover_match_pct,
        "flags": [{"code": f.code, "severity": f.severity, "message": f.message} for f in signals.flags],
    }
    case.status = CaseStatus.cam_ready

    await db.commit()
    await db.refresh(cam_report)

    return {
        "cam_report_id": cam_report.id,
        "version": cam_report.version,
        "risk_grade": signals.risk_grade,
        "recommendation": cam_sections.recommendation,
        "executive_summary": cam_sections.executive_summary,
        "risk_flags_count": len(cam_sections.risk_flags),
        "critical_flags": [f for f in cam_sections.risk_flags if f["severity"] == "critical"],
    }


@router.get("/{report_id}")
async def get_cam_report(
    case_id: str,
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CAMReport).where(CAMReport.id == report_id, CAMReport.case_id == case_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="CAM report not found")

    return {
        "id": report.id,
        "case_id": report.case_id,
        "version": report.version,
        "executive_summary": report.executive_summary,
        "borrower_profile": report.borrower_profile,
        "financial_analysis": report.financial_analysis,
        "banking_behaviour": report.banking_behaviour,
        "gst_compliance": report.gst_compliance,
        "bureau_summary": report.bureau_summary,
        "risk_flags": report.risk_flags,
        "proposed_structure": report.proposed_structure,
        "recommendation": report.recommendation.value if report.recommendation else None,
        "recommendation_rationale": report.recommendation_rationale,
        "generated_at": report.generated_at.isoformat(),
    }


# ── Partial reconstructors (from stored JSON) ─────────────────────────────────

def _reconstruct_bank(data: dict):
    from app.services.parsers.bank_statement_parser import BankStatementResult, MonthlySummary
    try:
        monthly = [
            MonthlySummary(
                month=m["month"],
                total_credits=m.get("total_credits", 0),
                total_debits=m.get("total_debits", 0),
                closing_balance=m.get("closing_balance", 0),
                bounce_count=m.get("bounce_count", 0),
                emi_obligations=m.get("emi_obligations", 0),
                avg_balance=m.get("avg_balance", 0),
            )
            for m in data.get("monthly_summaries", [])
        ]
        return BankStatementResult(
            account_number=data.get("account_number", ""),
            account_holder=data.get("account_holder", ""),
            bank_name=data.get("bank_name", ""),
            ifsc=data.get("ifsc", ""),
            statement_period_from=None,
            statement_period_to=None,
            transactions=[],
            monthly_summaries=monthly,
            total_credits_12m=data.get("total_credits_12m", 0),
            total_debits_12m=data.get("total_debits_12m", 0),
            average_monthly_bank_credit=data.get("average_monthly_bank_credit", data.get("average_monthly_credit", 0)),
            average_eod_balance=data.get("average_eod_balance", 0),
            bounce_count_12m=data.get("bounce_count_12m", 0),
            emi_obligations_monthly=data.get("emi_obligations_monthly", 0),
            inward_outward_ratio=data.get("inward_outward_ratio", 0),
            cash_withdrawal_pct=data.get("cash_withdrawal_pct", 0),
            flags=data.get("flags", []),
            extraction_confidence=data.get("extraction_confidence", 0),
        )
    except Exception as e:
        logger.warning(f"Bank reconstruct failed: {e}")
        return None


def _reconstruct_gst(data: dict):
    from app.services.parsers.gst_parser import GSTResult, GSTMonthlyEntry
    try:
        entries = [
            GSTMonthlyEntry(
                period=e["period"], turnover=e.get("turnover", 0),
                itc_claimed=e.get("itc_claimed", 0), igst_paid=e.get("igst_paid", 0),
                cgst_paid=e.get("cgst_paid", 0), sgst_paid=e.get("sgst_paid", 0),
                total_tax_paid=e.get("total_tax_paid", 0), filed=e.get("filed", True),
            )
            for e in data.get("entries", [])
        ]
        return GSTResult(
            gstin=data.get("gstin", ""), trade_name=data.get("trade_name", ""),
            legal_name=data.get("legal_name", ""), registration_date=None,
            return_type=data.get("return_type", "GSTR-3B"), entries=entries,
            total_turnover_annual=data.get("total_turnover_annual", 0),
            average_monthly_turnover=data.get("average_monthly_turnover", 0),
            total_itc_claimed=data.get("total_itc_claimed", 0),
            total_tax_paid=data.get("total_tax_paid", 0),
            filing_regularity_pct=data.get("filing_regularity_pct", 100),
            missing_periods=data.get("missing_periods", []),
            flags=data.get("flags", []),
            extraction_confidence=data.get("extraction_confidence", 0),
        )
    except Exception as e:
        logger.warning(f"GST reconstruct failed: {e}")
        return None


def _reconstruct_financials(data: dict):
    from app.services.parsers.financial_statement_parser import (
        FinancialStatementResult, ProfitAndLoss, BalanceSheet, FinancialRatios
    )
    try:
        years_data = data.get("years_available", [])
        pnl_data = data.get("pnl", [])
        bs_data = data.get("balance_sheets", [])
        ratios_data = data.get("ratios", [])

        def build_pnl(d):
            return ProfitAndLoss(**{k: d.get(k, 0) for k in ["year","revenue","cost_of_goods_sold","gross_profit","operating_expenses","ebitda","depreciation","ebit","interest","pbt","tax","pat","gross_margin_pct","ebitda_margin_pct","net_margin_pct"]})

        def build_bs(d):
            return BalanceSheet(**{k: d.get(k, 0) for k in ["year","cash_and_bank","trade_receivables","inventory","other_current_assets","total_current_assets","fixed_assets_net","total_assets","trade_payables","short_term_borrowings","other_current_liabilities","total_current_liabilities","long_term_borrowings","total_debt","net_worth","total_liabilities"]})

        def build_ratio(d):
            return FinancialRatios(**{k: d.get(k, 0) for k in ["year","current_ratio","quick_ratio","debt_equity_ratio","dscr","interest_coverage","roe","roa","asset_turnover","debtor_days","creditor_days","inventory_days","nwc"]})

        return FinancialStatementResult(
            entity_name=data.get("entity_name", ""), pan=data.get("pan", ""),
            years_available=years_data,
            pnl=[build_pnl(d) for d in pnl_data],
            balance_sheets=[build_bs(d) for d in bs_data],
            ratios=[build_ratio(d) for d in ratios_data],
            flags=data.get("flags", []),
            extraction_confidence=data.get("extraction_confidence", 0),
        )
    except Exception as e:
        logger.warning(f"Financials reconstruct failed: {e}")
        return None


def _reconstruct_bureau(data: dict):
    from app.services.parsers.bureau_parser import BureauResult, CreditAccount
    try:
        accounts = [
            CreditAccount(
                account_type=a.get("account_type", ""), lender=a.get("lender", ""),
                sanctioned_amount=a.get("sanctioned_amount", 0), current_balance=a.get("current_balance", 0),
                emi=a.get("emi", 0), open_date=None, close_date=None,
                status=a.get("status", "active"), dpd_history=a.get("dpd_history", []),
                worst_dpd=a.get("worst_dpd", 0), days_past_due_flag=a.get("days_past_due_flag", False),
            )
            for a in data.get("accounts", [])
        ]
        return BureauResult(
            bureau_name=data.get("bureau_name", ""), borrower_name=data.get("borrower_name", ""),
            pan=data.get("pan", ""), score=data.get("score", -1),
            score_version=data.get("score_version", ""), report_date=None,
            accounts=accounts,
            total_active_accounts=data.get("total_active_accounts", 0),
            total_credit_exposure=data.get("total_credit_exposure", 0),
            total_unsecured_exposure=data.get("total_unsecured_exposure", 0),
            total_enquiries_6m=data.get("total_enquiries_6m", 0),
            total_enquiries_12m=data.get("total_enquiries_12m", 0),
            worst_dpd_ever=data.get("worst_dpd_ever", 0),
            has_written_off=data.get("has_written_off", False),
            has_settled=data.get("has_settled", False),
            has_suit_filed=data.get("has_suit_filed", False),
            flags=data.get("flags", []),
            extraction_confidence=data.get("extraction_confidence", 0),
        )
    except Exception as e:
        logger.warning(f"Bureau reconstruct failed: {e}")
        return None
