"""
CAM Report Generator
Uses Claude to write natural-language commentary for each section.
Numbers ALWAYS come from parsed data — Claude only writes prose.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import anthropic
from loguru import logger

from app.core.config import settings
from app.services.parsers.bank_statement_parser import BankStatementResult
from app.services.parsers.gst_parser import GSTResult
from app.services.parsers.financial_statement_parser import FinancialStatementResult
from app.services.parsers.bureau_parser import BureauResult
from app.services.validators.cross_validator import RiskSignals


@dataclass
class CAMSections:
    executive_summary: str
    borrower_profile: dict
    financial_analysis: dict
    banking_behaviour: dict
    gst_compliance: dict
    bureau_summary: dict
    risk_flags: list[dict]
    proposed_structure: dict
    recommendation: str
    recommendation_rationale: str


_CLIENT = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

_SYSTEM_PROMPT = """
You are a senior credit underwriter at a leading Indian NBFC with 15 years of experience.
Your task is to write sections of a Credit Appraisal Memorandum (CAM report).

STRICT RULES:
1. NEVER invent or guess numbers. Every figure must be taken from the data provided.
2. Write in professional, formal English — no jargon, no buzzwords.
3. Be factual and concise. Each section should be 2–4 sentences unless specified.
4. If data is missing, say "Data not available" — do not speculate.
5. Flag risks honestly. A good underwriter does not hide problems.
6. Output only the requested text — no headers, no preamble, no markdown.
"""


def _llm(prompt: str, max_tokens: int = 400) -> str:
    try:
        response = _CLIENT.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=max_tokens,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text.strip()
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        return "[AI commentary unavailable — please review manually]"


def _fmt_cr(amount: float) -> str:
    """Format amount in crores."""
    if amount >= 1e7:
        return f"₹{amount/1e7:.2f} Cr"
    elif amount >= 1e5:
        return f"₹{amount/1e5:.2f} Lakh"
    return f"₹{amount:,.0f}"


def generate_executive_summary(
    borrower_name: str,
    loan_amount: float,
    loan_purpose: str,
    loan_type: str,
    signals: RiskSignals,
    bank: Optional[BankStatementResult],
    financials: Optional[FinancialStatementResult],
) -> str:
    dscr_str = f"{signals.dscr}" if signals.dscr else "not available"
    bureau_str = f"{signals.bureau_score}" if signals.bureau_score > 0 else "no prior history"
    gst_bank = f"{signals.gst_bank_turnover_match_pct}%" if signals.gst_bank_turnover_match_pct else "not computed"
    avg_credit = _fmt_cr(signals.average_monthly_bank_credit)
    risk_grade = signals.risk_grade
    critical_flags = [f.message for f in signals.flags if f.severity == "critical"]
    flag_str = "; ".join(critical_flags) if critical_flags else "None"

    prompt = f"""
Write a 3-sentence executive summary for the following loan appraisal:

Borrower: {borrower_name}
Loan requested: {_fmt_cr(loan_amount)} ({loan_type})
Loan purpose: {loan_purpose or 'not specified'}
DSCR: {dscr_str}
Bureau score: {bureau_str}
Average monthly bank credit: {avg_credit}
GST-to-bank turnover match: {gst_bank}
Risk grade: {risk_grade}
Critical flags: {flag_str}
Recommendation: {signals.recommendation.upper()}

The summary should: (1) introduce the borrower and loan ask, (2) state key financial strengths or concerns,
(3) state the overall recommendation and risk grade.
"""
    return _llm(prompt, max_tokens=300)


def generate_banking_commentary(bank: BankStatementResult) -> str:
    prompt = f"""
Write a 3-sentence banking behaviour commentary based on this data:

Statement period: {bank.statement_period_from} to {bank.statement_period_to}
Average monthly credit: {_fmt_cr(bank.average_monthly_bank_credit)}
Average EOD balance: {_fmt_cr(bank.average_eod_balance)}
Cheque/NACH bounces: {bank.bounce_count_12m}
Cash withdrawals: {bank.cash_withdrawal_pct}% of total debits
Monthly EMI obligations: {_fmt_cr(bank.emi_obligations_monthly)}
Inward/Outward ratio: {bank.inward_outward_ratio}
Key flags: {'; '.join(bank.flags) or 'None'}

Comment on cash flow adequacy, banking discipline, and any concerns.
"""
    return _llm(prompt)


def generate_gst_commentary(gst: GSTResult) -> str:
    prompt = f"""
Write a 2-sentence GST compliance commentary:

GSTIN: {gst.gstin}
Annual turnover declared: {_fmt_cr(gst.total_turnover_annual)}
Average monthly turnover: {_fmt_cr(gst.average_monthly_turnover)}
Total ITC claimed: {_fmt_cr(gst.total_itc_claimed)}
Filing regularity: {gst.filing_regularity_pct}%
Missing periods: {', '.join(gst.missing_periods) or 'None'}
Flags: {'; '.join(gst.flags) or 'None'}

Comment on filing discipline and turnover reliability.
"""
    return _llm(prompt, max_tokens=200)


def generate_bureau_commentary(bureau: BureauResult) -> str:
    accounts_summary = f"{bureau.total_active_accounts} active accounts, total exposure {_fmt_cr(bureau.total_credit_exposure)}"
    prompt = f"""
Write a 3-sentence credit bureau commentary:

Bureau: {bureau.bureau_name}
Score: {bureau.score} ({bureau.score_version})
{accounts_summary}
Worst DPD ever: {bureau.worst_dpd_ever} days
Written-off accounts: {'Yes' if bureau.has_written_off else 'No'}
Settled accounts: {'Yes' if bureau.has_settled else 'No'}
Suit filed: {'Yes' if bureau.has_suit_filed else 'No'}
Enquiries last 6 months: {bureau.total_enquiries_6m}
Flags: {'; '.join(bureau.flags) or 'None'}

Comment on credit score, repayment discipline, and any adverse events.
"""
    return _llm(prompt)


def generate_recommendation_rationale(
    borrower_name: str,
    recommendation: str,
    signals: RiskSignals,
    loan_amount: float,
) -> str:
    critical_flags = [f.message for f in signals.flags if f.severity in ("critical", "high")]
    positive_signals = []
    if signals.bureau_score >= 700:
        positive_signals.append(f"Strong bureau score of {signals.bureau_score}")
    if signals.dscr and signals.dscr >= 1.5:
        positive_signals.append(f"Healthy DSCR of {signals.dscr}")
    if signals.gst_bank_turnover_match_pct and 85 <= signals.gst_bank_turnover_match_pct <= 115:
        positive_signals.append("GST and bank turnover are well-aligned")
    if not signals.bounce_flag:
        positive_signals.append("Clean banking behaviour with no bounces")

    prompt = f"""
Write a 4-sentence recommendation rationale for:

Borrower: {borrower_name}
Loan amount: {_fmt_cr(loan_amount)}
Recommendation: {recommendation.upper()}
Risk grade: {signals.risk_grade}

Positive signals: {'; '.join(positive_signals) or 'None identified'}
Risk concerns (high/critical): {'; '.join(critical_flags) or 'None'}

The rationale should synthesise both strengths and concerns and justify the recommendation clearly.
{"If declining, state which specific flags drove the decline." if recommendation == "decline" else ""}
{"If approving, state the conditions or covenants recommended." if recommendation == "approve" else ""}
"""
    return _llm(prompt, max_tokens=350)


# ── Main generator ───────────────────────────────────────────────────────────

def generate_cam(
    borrower_name: str,
    loan_amount: float,
    loan_purpose: str,
    loan_type: str,
    loan_tenor_months: int,
    signals: RiskSignals,
    bank: Optional[BankStatementResult] = None,
    gst: Optional[GSTResult] = None,
    financials: Optional[FinancialStatementResult] = None,
    bureau: Optional[BureauResult] = None,
) -> CAMSections:
    logger.info(f"Generating CAM for {borrower_name}")

    # ── Executive summary ─────────────────────────────────────────────────────
    exec_summary = generate_executive_summary(
        borrower_name, loan_amount, loan_purpose, loan_type, signals, bank, financials
    )

    # ── Borrower profile (structured, no LLM needed) ──────────────────────────
    borrower_profile = {
        "name": borrower_name,
        "loan_amount_requested": loan_amount,
        "loan_type": loan_type,
        "loan_purpose": loan_purpose,
        "loan_tenor_months": loan_tenor_months,
        "gstin": gst.gstin if gst else None,
        "bureau_score": signals.bureau_score,
    }

    # ── Financial analysis ────────────────────────────────────────────────────
    financial_analysis: dict = {"years": []}
    if financials:
        for pnl, bs, ratio in zip(financials.pnl, financials.balance_sheets, financials.ratios):
            financial_analysis["years"].append({
                "year": pnl.year,
                "revenue": pnl.revenue,
                "ebitda": pnl.ebitda,
                "ebitda_margin_pct": pnl.ebitda_margin_pct,
                "pat": pnl.pat,
                "net_margin_pct": pnl.net_margin_pct,
                "total_debt": bs.total_debt,
                "net_worth": bs.net_worth,
                "current_ratio": ratio.current_ratio,
                "debt_equity_ratio": ratio.debt_equity_ratio,
                "dscr": ratio.dscr,
                "interest_coverage": ratio.interest_coverage,
                "debtor_days": ratio.debtor_days,
                "creditor_days": ratio.creditor_days,
            })

    # ── Banking behaviour ─────────────────────────────────────────────────────
    banking_behaviour: dict = {}
    if bank:
        banking_behaviour = {
            "account_number": bank.account_number,
            "bank_name": bank.bank_name,
            "period_from": str(bank.statement_period_from),
            "period_to": str(bank.statement_period_to),
            "total_credits_12m": bank.total_credits_12m,
            "average_monthly_credit": bank.average_monthly_bank_credit,
            "average_eod_balance": bank.average_eod_balance,
            "bounce_count_12m": bank.bounce_count_12m,
            "emi_obligations_monthly": bank.emi_obligations_monthly,
            "cash_withdrawal_pct": bank.cash_withdrawal_pct,
            "monthly_summaries": [
                {
                    "month": m.month, "credits": m.total_credits,
                    "debits": m.total_debits, "closing_balance": m.closing_balance,
                    "bounces": m.bounce_count,
                }
                for m in bank.monthly_summaries
            ],
            "commentary": generate_banking_commentary(bank),
        }

    # ── GST compliance ────────────────────────────────────────────────────────
    gst_compliance: dict = {}
    if gst:
        gst_compliance = {
            "gstin": gst.gstin,
            "trade_name": gst.trade_name,
            "annual_turnover": gst.total_turnover_annual,
            "average_monthly_turnover": gst.average_monthly_turnover,
            "itc_claimed": gst.total_itc_claimed,
            "filing_regularity_pct": gst.filing_regularity_pct,
            "missing_periods": gst.missing_periods,
            "gst_bank_match_pct": signals.gst_bank_turnover_match_pct,
            "commentary": generate_gst_commentary(gst),
        }

    # ── Bureau summary ────────────────────────────────────────────────────────
    bureau_summary: dict = {}
    if bureau:
        bureau_summary = {
            "bureau": bureau.bureau_name,
            "score": bureau.score,
            "total_active_accounts": bureau.total_active_accounts,
            "total_exposure": bureau.total_credit_exposure,
            "worst_dpd": bureau.worst_dpd_ever,
            "written_off": bureau.has_written_off,
            "suit_filed": bureau.has_suit_filed,
            "enquiries_6m": bureau.total_enquiries_6m,
            "accounts": [
                {
                    "type": a.account_type, "lender": a.lender,
                    "balance": a.current_balance, "emi": a.emi,
                    "status": a.status, "worst_dpd": a.worst_dpd,
                }
                for a in bureau.accounts[:10]  # top 10
            ],
            "commentary": generate_bureau_commentary(bureau),
        }

    # ── Risk flags ────────────────────────────────────────────────────────────
    risk_flags = [
        {
            "code": f.code,
            "severity": f.severity,
            "message": f.message,
            "source": f.source,
        }
        for f in signals.flags
    ]

    # ── Proposed structure ────────────────────────────────────────────────────
    proposed_structure = {
        "loan_amount": loan_amount,
        "loan_type": loan_type,
        "tenor_months": loan_tenor_months,
        "suggested_rate_range": _suggest_rate(signals),
        "recommended_covenants": _suggest_covenants(signals),
    }

    # ── Recommendation ────────────────────────────────────────────────────────
    recommendation = signals.recommendation
    rationale = generate_recommendation_rationale(borrower_name, recommendation, signals, loan_amount)

    logger.info(f"CAM generation complete. Recommendation: {recommendation.upper()}")

    return CAMSections(
        executive_summary=exec_summary,
        borrower_profile=borrower_profile,
        financial_analysis=financial_analysis,
        banking_behaviour=banking_behaviour,
        gst_compliance=gst_compliance,
        bureau_summary=bureau_summary,
        risk_flags=risk_flags,
        proposed_structure=proposed_structure,
        recommendation=recommendation,
        recommendation_rationale=rationale,
    )


def _suggest_rate(signals: RiskSignals) -> str:
    score = signals.bureau_score
    grade = signals.risk_grade
    base = 11.0
    if grade == "A" and score >= 750:
        return f"{base}% – {base + 1}%"
    elif grade == "A":
        return f"{base + 1}% – {base + 2}%"
    elif grade == "B":
        return f"{base + 2}% – {base + 3.5}%"
    elif grade == "C":
        return f"{base + 3.5}% – {base + 5}%"
    return "Rate subject to credit committee review"


def _suggest_covenants(signals: RiskSignals) -> list[str]:
    covenants = [
        "Quarterly financial statements to be submitted within 45 days of quarter close",
        "Annual audited financials within 90 days of fiscal year end",
        "Bank account to be maintained with sanctioning bank (primary banking relationship)",
    ]
    if signals.dscr and signals.dscr < 1.5:
        covenants.append("DSCR covenant: minimum 1.25x to be maintained at all times")
    if signals.gst_bank_mismatch_flag:
        covenants.append("GST reconciliation certificate required quarterly")
    if signals.bounce_flag:
        covenants.append("Zero bounce condition: any cheque/NACH dishonour triggers review")
    if signals.debt_equity_ratio and signals.debt_equity_ratio > 2.0:
        covenants.append("Debt-to-equity not to exceed 3.0x without prior lender approval")
    return covenants
