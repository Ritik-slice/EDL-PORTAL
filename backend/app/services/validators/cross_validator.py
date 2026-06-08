"""
Cross-Validation Engine
Triangulates bank statement, GST, financial statement, and bureau data.
Produces a unified RiskSignals object with all flags and a risk grade.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.services.parsers.bank_statement_parser import BankStatementResult
from app.services.parsers.gst_parser import GSTResult
from app.services.parsers.financial_statement_parser import FinancialStatementResult
from app.services.parsers.bureau_parser import BureauResult


@dataclass
class ValidationFlag:
    code: str
    severity: str    # "critical" | "high" | "medium" | "low"
    message: str
    source: str      # which data source triggered this


@dataclass
class RiskSignals:
    # Cross-validation results
    gst_bank_turnover_match_pct: Optional[float]
    gst_bank_mismatch_flag: bool
    itr_bank_income_match_pct: Optional[float]

    # Credit metrics
    dscr: Optional[float]
    dscr_flag: bool
    foir: Optional[float]
    foir_flag: bool
    current_ratio: Optional[float]
    debt_equity_ratio: Optional[float]

    # Banking behaviour
    bounce_count_12m: int
    bounce_flag: bool
    average_monthly_bank_credit: float
    cash_withdrawal_pct: float

    # Bureau signals
    bureau_score: int
    bureau_score_flag: bool
    worst_dpd: int
    has_written_off: bool
    has_suit_filed: bool
    enquiries_6m: int

    # GST signals
    gst_filing_regular: bool
    gst_missing_periods: list[str]

    # All flags combined
    flags: list[ValidationFlag] = field(default_factory=list)

    # Final grade
    risk_grade: str = "B"   # A, B, C, D
    recommendation: str = "refer"  # approve, decline, refer


def _grade(flags: list[ValidationFlag]) -> tuple[str, str]:
    critical = sum(1 for f in flags if f.severity == "critical")
    high = sum(1 for f in flags if f.severity == "high")
    medium = sum(1 for f in flags if f.severity == "medium")

    if critical >= 1 or high >= 3:
        return "D", "decline"
    elif high >= 1 or medium >= 3:
        return "C", "refer"
    elif medium >= 1:
        return "B", "refer"
    else:
        return "A", "approve"


def run_cross_validation(
    bank: Optional[BankStatementResult] = None,
    gst: Optional[GSTResult] = None,
    financials: Optional[FinancialStatementResult] = None,
    bureau: Optional[BureauResult] = None,
    loan_amount: float = 0,
    loan_tenor_months: int = 60,
) -> RiskSignals:
    flags: list[ValidationFlag] = []

    # ── 1. GST vs Bank turnover match ─────────────────────────────────────────
    gst_bank_match_pct = None
    gst_bank_mismatch = False

    if bank and gst and gst.total_turnover_annual > 0 and bank.total_credits_12m > 0:
        # Bank credits should be 85–115% of GST declared turnover
        match_pct = bank.total_credits_12m / gst.total_turnover_annual * 100
        gst_bank_match_pct = round(match_pct, 1)
        delta = abs(100 - match_pct)

        if delta > 30:
            gst_bank_mismatch = True
            sev = "critical" if delta > 50 else "high"
            flags.append(ValidationFlag(
                code="GST_BANK_MISMATCH",
                severity=sev,
                message=f"Bank credits (₹{bank.total_credits_12m:,.0f}) are {match_pct:.0f}% of GST declared turnover (₹{gst.total_turnover_annual:,.0f}). Delta: {delta:.0f}%.",
                source="bank_statement + gst_return",
            ))

    # ── 2. DSCR ───────────────────────────────────────────────────────────────
    dscr = None
    dscr_flag = False

    if financials and financials.ratios:
        latest_ratio = financials.ratios[-1]
        dscr = latest_ratio.dscr
        if dscr and dscr < 1.25:
            dscr_flag = True
            sev = "critical" if dscr < 1.0 else "high"
            flags.append(ValidationFlag(
                code="LOW_DSCR",
                severity=sev,
                message=f"DSCR of {dscr} is below the required threshold of 1.25. Borrower may struggle to service debt from operating cash flows.",
                source="financial_statement",
            ))

    # ── 3. FOIR (Fixed Obligation to Income Ratio) ────────────────────────────
    foir = None
    foir_flag = False

    if bank and bureau:
        total_emi_monthly = bank.emi_obligations_monthly
        income_monthly = bank.average_monthly_bank_credit
        if income_monthly > 0:
            foir = round(total_emi_monthly / income_monthly * 100, 1)
            if foir > 50:
                foir_flag = True
                flags.append(ValidationFlag(
                    code="HIGH_FOIR",
                    severity="high",
                    message=f"FOIR of {foir}% exceeds the 50% policy limit. Monthly EMI obligations of ₹{total_emi_monthly:,.0f} against monthly income of ₹{income_monthly:,.0f}.",
                    source="bank_statement",
                ))

    # ── 4. Bounce count ───────────────────────────────────────────────────────
    bounce_count = bank.bounce_count_12m if bank else 0
    bounce_flag = bounce_count > 2
    if bounce_flag:
        flags.append(ValidationFlag(
            code="HIGH_BOUNCE_COUNT",
            severity="high" if bounce_count > 5 else "medium",
            message=f"{bounce_count} cheque/NACH bounces detected in the statement period. Indicates cash flow stress.",
            source="bank_statement",
        ))

    # ── 5. Cash withdrawal concentration ─────────────────────────────────────
    cash_wd_pct = bank.cash_withdrawal_pct if bank else 0
    if cash_wd_pct > 40:
        flags.append(ValidationFlag(
            code="HIGH_CASH_WITHDRAWAL",
            severity="medium",
            message=f"{cash_wd_pct}% of debits are cash withdrawals. High cash economy exposure reduces verifiable income trail.",
            source="bank_statement",
        ))

    # ── 6. Bureau score ───────────────────────────────────────────────────────
    bureau_score = bureau.score if bureau else -1
    bureau_score_flag = False
    if bureau:
        if bureau_score == -1:
            bureau_score_flag = True
            flags.append(ValidationFlag(
                code="NO_CREDIT_HISTORY",
                severity="medium",
                message="Borrower has no credit bureau score. No prior formal credit history.",
                source="bureau_report",
            ))
        elif bureau_score < 650:
            bureau_score_flag = True
            flags.append(ValidationFlag(
                code="LOW_BUREAU_SCORE",
                severity="critical",
                message=f"Bureau score of {bureau_score} is below the minimum acceptable threshold of 650.",
                source="bureau_report",
            ))
        elif bureau_score < 700:
            bureau_score_flag = True
            flags.append(ValidationFlag(
                code="BORDERLINE_BUREAU_SCORE",
                severity="medium",
                message=f"Bureau score of {bureau_score} is borderline. Enhanced due diligence recommended.",
                source="bureau_report",
            ))

    # ── 7. Delinquency and legal flags ────────────────────────────────────────
    worst_dpd = bureau.worst_dpd_ever if bureau else 0
    has_written_off = bureau.has_written_off if bureau else False
    has_suit_filed = bureau.has_suit_filed if bureau else False

    if bureau:
        if has_written_off:
            flags.append(ValidationFlag(
                code="WRITTEN_OFF",
                severity="critical",
                message="Borrower has a written-off loan account in bureau history. Indicates prior default.",
                source="bureau_report",
            ))
        if has_suit_filed:
            flags.append(ValidationFlag(
                code="SUIT_FILED",
                severity="critical",
                message="Legal suit has been filed against the borrower by a previous lender.",
                source="bureau_report",
            ))
        if worst_dpd >= 90:
            flags.append(ValidationFlag(
                code="SEVERE_DELINQUENCY",
                severity="critical",
                message=f"Worst DPD of {worst_dpd} days recorded. Borrower has been severely delinquent.",
                source="bureau_report",
            ))
        elif worst_dpd >= 30:
            flags.append(ValidationFlag(
                code="DELINQUENCY_HISTORY",
                severity="high",
                message=f"Worst DPD of {worst_dpd} days recorded in bureau history.",
                source="bureau_report",
            ))
        if bureau.total_enquiries_6m > 6:
            flags.append(ValidationFlag(
                code="CREDIT_HUNGER",
                severity="medium",
                message=f"{bureau.total_enquiries_6m} bureau enquiries in last 6 months. Potential credit hunger.",
                source="bureau_report",
            ))

    # ── 8. GST filing regularity ──────────────────────────────────────────────
    gst_regular = True
    gst_missing = []
    if gst:
        gst_missing = gst.missing_periods
        gst_regular = len(gst_missing) == 0
        if gst_missing:
            flags.append(ValidationFlag(
                code="GST_FILING_GAPS",
                severity="medium",
                message=f"GSTR filing gaps detected for: {', '.join(gst_missing)}. Compliance risk.",
                source="gst_return",
            ))

    # ── 9. Leverage ───────────────────────────────────────────────────────────
    de_ratio = None
    current_ratio = None
    if financials and financials.ratios:
        latest = financials.ratios[-1]
        de_ratio = latest.debt_equity_ratio
        current_ratio = latest.current_ratio
        if de_ratio and de_ratio > 3.0:
            flags.append(ValidationFlag(
                code="HIGH_LEVERAGE",
                severity="high",
                message=f"Debt-to-equity ratio of {de_ratio} exceeds 3.0x. Highly leveraged balance sheet.",
                source="financial_statement",
            ))
        if current_ratio and current_ratio < 1.0:
            flags.append(ValidationFlag(
                code="POOR_LIQUIDITY",
                severity="high",
                message=f"Current ratio of {current_ratio} is below 1.0. Borrower may face short-term liquidity issues.",
                source="financial_statement",
            ))

    # ── 10. Revenue decline ───────────────────────────────────────────────────
    if financials and len(financials.pnl) >= 2:
        rev_first = financials.pnl[0].revenue
        rev_last = financials.pnl[-1].revenue
        if rev_last < rev_first * 0.8:
            flags.append(ValidationFlag(
                code="DECLINING_REVENUE",
                severity="high",
                message=f"Revenue declined from ₹{rev_first:,.0f} to ₹{rev_last:,.0f} ({((rev_last/rev_first-1)*100):.0f}%) over the statement period.",
                source="financial_statement",
            ))

    # Propagate individual parser flags as low-severity
    for source, result in [("bank_statement", bank), ("gst_return", gst), ("financial_statement", financials), ("bureau_report", bureau)]:
        if result and hasattr(result, "flags"):
            for f in result.flags:
                if not any(vf.message == f for vf in flags):
                    flags.append(ValidationFlag(code="PARSER_FLAG", severity="low", message=f, source=source))

    risk_grade, recommendation = _grade(flags)

    return RiskSignals(
        gst_bank_turnover_match_pct=gst_bank_match_pct,
        gst_bank_mismatch_flag=gst_bank_mismatch,
        itr_bank_income_match_pct=None,
        dscr=dscr,
        dscr_flag=dscr_flag,
        foir=foir,
        foir_flag=foir_flag,
        current_ratio=current_ratio,
        debt_equity_ratio=de_ratio,
        bounce_count_12m=bounce_count,
        bounce_flag=bounce_flag,
        average_monthly_bank_credit=bank.average_monthly_bank_credit if bank else 0,
        cash_withdrawal_pct=cash_wd_pct,
        bureau_score=bureau_score,
        bureau_score_flag=bureau_score_flag,
        worst_dpd=worst_dpd,
        has_written_off=has_written_off,
        has_suit_filed=has_suit_filed,
        enquiries_6m=bureau.total_enquiries_6m if bureau else 0,
        gst_filing_regular=gst_regular,
        gst_missing_periods=gst_missing,
        flags=flags,
        risk_grade=risk_grade,
        recommendation=recommendation,
    )
