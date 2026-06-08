"""
Credit Bureau Report Parser
Handles CIBIL, Experian, and Equifax PDF reports.
Extracts score, account history, DPD timeline, and risk signals.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from io import BytesIO
from typing import Optional

import pdfplumber
from loguru import logger


@dataclass
class CreditAccount:
    account_type: str        # Home Loan, CC, Personal Loan, etc.
    lender: str
    sanctioned_amount: float
    current_balance: float
    emi: float
    open_date: Optional[datetime]
    close_date: Optional[datetime]
    status: str              # Active, Closed, Written Off, Settled
    dpd_history: list[int]   # DPD values month-wise (last 36 months)
    worst_dpd: int
    days_past_due_flag: bool


@dataclass
class BureauResult:
    bureau_name: str         # CIBIL, Experian, Equifax
    borrower_name: str
    pan: str
    score: int
    score_version: str
    report_date: Optional[datetime]

    accounts: list[CreditAccount]

    # Aggregates
    total_active_accounts: int
    total_credit_exposure: float
    total_unsecured_exposure: float
    total_enquiries_6m: int
    total_enquiries_12m: int
    worst_dpd_ever: int
    has_written_off: bool
    has_settled: bool
    has_suit_filed: bool

    flags: list[str] = field(default_factory=list)
    extraction_confidence: float = 0.0


# ── Text extractor ───────────────────────────────────────────────────────────

def _extract_full_text(content: bytes) -> str:
    text = ""
    with pdfplumber.open(BytesIO(content)) as pdf:
        for page in pdf.pages:
            text += (page.extract_text() or "") + "\n"
    return text


# ── Score extractor ──────────────────────────────────────────────────────────

def _extract_score(text: str) -> tuple[int, str, str]:
    """Returns (score, version, bureau_name)."""
    patterns = [
        # CIBIL
        (r"CIBIL\s*(?:Trans[Uu]nion)?\s*Score[:\s]+(\d{3})", "CIBIL TransUnion"),
        # Experian
        (r"Experian\s*(?:Credit)?\s*Score[:\s]+(\d{3})", "Experian"),
        # Equifax
        (r"Equifax\s*(?:Credit)?\s*Score[:\s]+(\d{3})", "Equifax"),
        # Generic
        (r"Credit\s*Score[:\s]+(\d{3})", "Unknown"),
        (r"Score[:\s]+(-1|\d{3})", "Unknown"),
    ]
    for pat, bureau in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            score_raw = m.group(1)
            score = -1 if score_raw == "-1" else int(score_raw)
            version = "v2" if "v2" in text else "v1"
            return score, version, bureau

    return -1, "", "Unknown"


# ── Account extractor ─────────────────────────────────────────────────────────

_ACCOUNT_TYPE_PATTERNS = [
    r"(Home\s*Loan|Mortgage|Housing\s*Loan)",
    r"(Auto\s*Loan|Vehicle\s*Loan|Car\s*Loan|Two\s*Wheeler)",
    r"(Personal\s*Loan|PL)",
    r"(Business\s*Loan|SME\s*Loan|MSME\s*Loan)",
    r"(Credit\s*Card|CC)",
    r"(Overdraft|OD|Cash\s*Credit|CC\s*Limit)",
    r"(Education\s*Loan|Student\s*Loan)",
    r"(Gold\s*Loan)",
    r"(Microfinance|MFI\s*Loan|JLG)",
]

_STATUS_PATTERNS = {
    "written_off": [r"written.?off", r"write.?off"],
    "settled": [r"settled", r"settlement"],
    "suit_filed": [r"suit\s*filed", r"legal\s*action"],
    "npa": [r"\bNPA\b", r"non.performing"],
    "closed": [r"\bclosed\b", r"fully\s*paid"],
    "active": [r"\bactive\b", r"\bcurrent\b", r"on.going"],
}


def _detect_status(text_chunk: str) -> str:
    chunk_lower = text_chunk.lower()
    for status, patterns in _STATUS_PATTERNS.items():
        for pat in patterns:
            if re.search(pat, chunk_lower):
                return status
    return "active"


def _extract_dpd(text_chunk: str) -> list[int]:
    """Extract DPD (Days Past Due) sequence from a text chunk."""
    # DPD usually appears as: 000 000 030 000 060 ...
    dpd_line = re.findall(r"\b(0{3}|\d{3}|XXX|SMA|STD|SUB|DBT|LSS)\b", text_chunk)
    mapping = {"XXX": 0, "SMA": 30, "STD": 0, "SUB": 90, "DBT": 180, "LSS": 360}
    result = []
    for d in dpd_line:
        if d.isdigit():
            result.append(int(d))
        elif d in mapping:
            result.append(mapping[d])
    return result[:36]  # last 36 months max


def _extract_amount(text: str, keyword: str) -> float:
    m = re.search(keyword + r"[:\s₹]+([\d,]+\.?\d*)", text, re.IGNORECASE)
    if m:
        return float(m.group(1).replace(",", ""))
    return 0.0


def _extract_accounts(text: str) -> list[CreditAccount]:
    accounts: list[CreditAccount] = []

    # Split on account boundaries — bureaus usually use "Account #" or lender name repeating
    chunks = re.split(r"(?=(?:Account\s*(?:Number|No)[.:\s]+[\dX*]+))", text)

    for chunk in chunks:
        if len(chunk) < 100:
            continue

        # Detect account type
        acc_type = "Loan/Credit"
        for pat in _ACCOUNT_TYPE_PATTERNS:
            m = re.search(pat, chunk, re.IGNORECASE)
            if m:
                acc_type = m.group(1)
                break

        # Detect lender
        lender_m = re.search(r"(?:Member|Bank|Lender|Institution)[:\s]+([A-Z][A-Za-z\s&.]+?)(?:\n|Loan|Credit)", chunk)
        lender = lender_m.group(1).strip() if lender_m else "Unknown Lender"

        sanctioned = _extract_amount(chunk, r"(?:Sanctioned|Credit\s*Limit|Loan\s*Amount)")
        balance = _extract_amount(chunk, r"(?:Current\s*Balance|Outstanding|Balance)")
        emi = _extract_amount(chunk, r"(?:EMI|Monthly\s*Installment|Installment\s*Amount)")

        status = _detect_status(chunk)
        dpd = _extract_dpd(chunk)
        worst_dpd = max(dpd) if dpd else 0

        accounts.append(CreditAccount(
            account_type=acc_type,
            lender=lender,
            sanctioned_amount=sanctioned,
            current_balance=balance,
            emi=emi,
            open_date=None,
            close_date=None,
            status=status,
            dpd_history=dpd,
            worst_dpd=worst_dpd,
            days_past_due_flag=worst_dpd > 0,
        ))

    return accounts


# ── Enquiry extractor ─────────────────────────────────────────────────────────

def _count_enquiries(text: str) -> tuple[int, int]:
    """Returns (enquiries_6m, enquiries_12m)."""
    now = datetime.now()

    # Find enquiry dates
    enquiry_section = re.search(r"(?:ENQUIR|ENQUIRIES|CREDIT INQUIR)(.*?)(?:ACCOUNT|\Z)", text, re.IGNORECASE | re.DOTALL)
    if not enquiry_section:
        return 0, 0

    dates = re.findall(r"(\d{2}[-/]\d{2}[-/]\d{4}|\d{2}-[A-Za-z]{3}-\d{4})", enquiry_section.group(1))
    count_6m = count_12m = 0
    for d in dates:
        for fmt in ["%d/%m/%Y", "%d-%m-%Y", "%d-%b-%Y"]:
            try:
                dt = datetime.strptime(d, fmt)
                diff_months = (now.year - dt.year) * 12 + (now.month - dt.month)
                if diff_months <= 6:
                    count_6m += 1
                if diff_months <= 12:
                    count_12m += 1
                break
            except ValueError:
                continue

    return count_6m, count_12m


# ── Flag generator ───────────────────────────────────────────────────────────

def _generate_flags(result_data: dict) -> list[str]:
    flags: list[str] = []

    score = result_data["score"]
    if score == -1:
        flags.append("NO CREDIT HISTORY: borrower has no bureau score (new to credit)")
    elif score < 650:
        flags.append(f"LOW CREDIT SCORE: {score} (below acceptable threshold of 650)")
    elif score < 700:
        flags.append(f"BORDERLINE CREDIT SCORE: {score} (between 650–700, requires deeper review)")

    if result_data["has_written_off"]:
        flags.append("WRITTEN-OFF ACCOUNT: borrower has a write-off in credit history")
    if result_data["has_settled"]:
        flags.append("SETTLED ACCOUNT: one or more accounts settled for less than full amount")
    if result_data["has_suit_filed"]:
        flags.append("SUIT FILED: legal action recorded against borrower")

    if result_data["worst_dpd_ever"] >= 90:
        flags.append(f"SEVERE DELINQUENCY: worst DPD {result_data['worst_dpd_ever']} days")
    elif result_data["worst_dpd_ever"] >= 30:
        flags.append(f"DELINQUENCY HISTORY: DPD up to {result_data['worst_dpd_ever']} days recorded")

    if result_data["total_enquiries_6m"] > 6:
        flags.append(f"EXCESSIVE ENQUIRIES: {result_data['total_enquiries_6m']} bureau enquiries in last 6 months (credit hunger)")

    return flags


# ── Public interface ──────────────────────────────────────────────────────────

def parse_bureau_report(content: bytes, filename: str) -> BureauResult:
    logger.info(f"Parsing bureau report: {filename}")

    text = _extract_full_text(content)
    score, version, bureau = _extract_score(text)

    pan_m = re.search(r"\b([A-Z]{5}\d{4}[A-Z])\b", text)
    pan = pan_m.group(1) if pan_m else ""

    name_m = re.search(r"(?:Consumer|Borrower|Applicant)\s*Name[:\s]+([A-Z][A-Z\s]+?)(?:\n|DOB|PAN)", text)
    borrower_name = name_m.group(1).strip() if name_m else ""

    date_m = re.search(r"Report\s*(?:Date|Generated)[:\s]+(\d{2}[-/]\d{2}[-/]\d{4})", text, re.IGNORECASE)
    report_date = None
    if date_m:
        for fmt in ["%d/%m/%Y", "%d-%m-%Y"]:
            try:
                report_date = datetime.strptime(date_m.group(1), fmt)
                break
            except ValueError:
                continue

    accounts = _extract_accounts(text)
    enquiries_6m, enquiries_12m = _count_enquiries(text)

    has_written_off = any(a.status == "written_off" for a in accounts)
    has_settled = any(a.status == "settled" for a in accounts)
    has_suit_filed = any(a.status == "suit_filed" for a in accounts)
    worst_dpd = max((a.worst_dpd for a in accounts), default=0)
    active_accounts = [a for a in accounts if a.status == "active"]
    total_exposure = sum(a.current_balance for a in active_accounts)
    unsecured_types = {"Personal Loan", "Credit Card", "Microfinance", "PL", "CC"}
    unsecured = sum(a.current_balance for a in active_accounts if a.account_type in unsecured_types)

    result_data = {
        "score": score, "has_written_off": has_written_off,
        "has_settled": has_settled, "has_suit_filed": has_suit_filed,
        "worst_dpd_ever": worst_dpd, "total_enquiries_6m": enquiries_6m,
    }
    flags = _generate_flags(result_data)

    confidence = 0.9 if score > 0 else 0.4

    return BureauResult(
        bureau_name=bureau, borrower_name=borrower_name, pan=pan,
        score=score, score_version=version, report_date=report_date,
        accounts=accounts,
        total_active_accounts=len(active_accounts),
        total_credit_exposure=round(total_exposure, 2),
        total_unsecured_exposure=round(unsecured, 2),
        total_enquiries_6m=enquiries_6m, total_enquiries_12m=enquiries_12m,
        worst_dpd_ever=worst_dpd,
        has_written_off=has_written_off, has_settled=has_settled, has_suit_filed=has_suit_filed,
        flags=flags, extraction_confidence=confidence,
    )
