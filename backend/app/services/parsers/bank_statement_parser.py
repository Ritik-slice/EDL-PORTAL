"""
Bank Statement Parser
Handles PDF and Excel bank statements from major Indian banks.
Extracts transactions, computes cash flow analytics, and flags risk signals.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Optional

import pandas as pd
import pdfplumber
from loguru import logger


# ── Data structures ─────────────────────────────────────────────────────────

@dataclass
class Transaction:
    date: datetime
    narration: str
    debit: float
    credit: float
    balance: float
    category: str = "uncategorised"
    source_page: int = 0


@dataclass
class MonthlySummary:
    month: str          # "2024-01"
    total_credits: float
    total_debits: float
    closing_balance: float
    bounce_count: int
    emi_debits: float
    avg_balance: float


@dataclass
class BankStatementResult:
    account_number: str
    account_holder: str
    bank_name: str
    ifsc: str
    statement_period_from: Optional[datetime]
    statement_period_to: Optional[datetime]
    transactions: list[Transaction]
    monthly_summaries: list[MonthlySummary]
    # Aggregates
    total_credits_12m: float
    total_debits_12m: float
    average_monthly_bank_credit: float
    average_eod_balance: float
    bounce_count_12m: int
    emi_obligations_monthly: float
    inward_outward_ratio: float
    cash_withdrawal_pct: float
    # Flags
    flags: list[str] = field(default_factory=list)
    extraction_confidence: float = 0.0


# ── Transaction categoriser ──────────────────────────────────────────────────

_CATEGORY_PATTERNS: dict[str, list[str]] = {
    "emi_debit": [r"emi", r"equated.*monthly", r"loan.*inst", r"nach.*debit", r"ecs.*debit", r"mandate"],
    "salary_credit": [r"salary", r"sal cr", r"payroll", r"wages"],
    "gst_payment": [r"gst", r"igst", r"cgst", r"sgst"],
    "cash_withdrawal": [r"atm.*wd", r"cash.*wd", r"cash withdrawal", r"atm withdraw"],
    "cash_deposit": [r"cash dep", r"cash credit", r"cdm"],
    "upi_credit": [r"upi.*cr", r"upi/", r"gpay", r"phonepe", r"paytm"],
    "upi_debit": [r"upi.*dr", r"upi.*dbt"],
    "neft_rtgs_credit": [r"neft.*cr", r"rtgs.*cr", r"imps.*cr"],
    "neft_rtgs_debit": [r"neft.*dr", r"rtgs.*dr"],
    "cheque_bounce": [r"chq ret", r"cheque ret", r"chq.*ret", r"return.*chq", r"inward.*ret", r"outward.*ret"],
    "bank_charges": [r"charges", r"service.*fee", r"annual.*fee", r"sms.*chrg"],
    "interest_credit": [r"interest cr", r"int.*cr", r"fd.*int"],
    "dividend": [r"dividend", r"div.*cr"],
    "tax_deduction": [r"tds", r"tax deducted"],
}


def _categorise(narration: str) -> str:
    n = narration.lower()
    for category, patterns in _CATEGORY_PATTERNS.items():
        for pat in patterns:
            if re.search(pat, n):
                return category
    return "uncategorised"


# ── Bank-specific column detectors ──────────────────────────────────────────

_COLUMN_ALIASES = {
    "date":     ["date", "txn date", "value date", "trans date", "transaction date", "posting date"],
    "narration": ["narration", "description", "particulars", "remarks", "details", "transaction details"],
    "debit":    ["debit", "withdrawal", "dr", "debit amount", "withdrawal amt"],
    "credit":   ["credit", "deposit", "cr", "credit amount", "deposit amt"],
    "balance":  ["balance", "running balance", "closing balance", "available balance"],
}


def _normalise_columns(df: pd.DataFrame) -> Optional[pd.DataFrame]:
    """Map messy bank column headers to canonical names."""
    col_map: dict[str, str] = {}
    lower_cols = {c.lower().strip(): c for c in df.columns}

    for canonical, aliases in _COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in lower_cols:
                col_map[lower_cols[alias]] = canonical
                break

    if len(col_map) < 3:
        return None

    df = df.rename(columns=col_map)
    required = {"date", "narration", "balance"}
    if not required.issubset(df.columns):
        return None

    if "debit" not in df.columns:
        df["debit"] = 0.0
    if "credit" not in df.columns:
        df["credit"] = 0.0

    return df


# ── Number cleaner ───────────────────────────────────────────────────────────

def _to_float(val) -> float:
    if pd.isna(val) or val == "" or val is None:
        return 0.0
    s = str(val).replace(",", "").replace("₹", "").replace(" ", "").strip()
    # Handle (1234.56) as negative
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    try:
        return float(s)
    except ValueError:
        return 0.0


def _parse_date(val) -> Optional[datetime]:
    if pd.isna(val) or val == "":
        return None
    formats = ["%d/%m/%Y", "%d-%m-%Y", "%d-%b-%Y", "%d %b %Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%y"]
    s = str(val).strip()
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    try:
        return pd.to_datetime(s, dayfirst=True).to_pydatetime()
    except Exception:
        return None


# ── PDF parser ───────────────────────────────────────────────────────────────

def _extract_from_pdf(content: bytes) -> tuple[list[Transaction], dict]:
    transactions: list[Transaction] = []
    meta: dict = {"account_number": "", "account_holder": "", "bank_name": "", "ifsc": ""}

    with pdfplumber.open(BytesIO(content)) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""

            # Extract metadata from first page
            if page_num == 1:
                _extract_metadata_from_text(text, meta)

            # Extract tables
            tables = page.extract_tables()
            for table in tables:
                if not table or len(table) < 2:
                    continue
                df = pd.DataFrame(table[1:], columns=table[0])
                df = _normalise_columns(df)
                if df is None:
                    continue

                for _, row in df.iterrows():
                    date = _parse_date(row.get("date"))
                    if date is None:
                        continue
                    narration = str(row.get("narration", "")).strip()
                    debit = _to_float(row.get("debit", 0))
                    credit = _to_float(row.get("credit", 0))
                    balance = _to_float(row.get("balance", 0))

                    transactions.append(Transaction(
                        date=date,
                        narration=narration,
                        debit=debit,
                        credit=credit,
                        balance=balance,
                        category=_categorise(narration),
                        source_page=page_num,
                    ))

    return transactions, meta


def _extract_metadata_from_text(text: str, meta: dict):
    patterns = {
        "account_number": [r"account\s*no[.:]\s*([\dX]+)", r"a/c\s*no[.:]\s*([\dX]+)"],
        "account_holder": [r"account\s*holder[:\s]+([A-Z][A-Z\s]+)", r"name[:\s]+([A-Z][A-Z\s]+)"],
        "ifsc": [r"IFSC[:\s]+([A-Z]{4}0[A-Z0-9]{6})"],
        "bank_name": [r"(State Bank of India|HDFC Bank|ICICI Bank|Axis Bank|Kotak Mahindra|Yes Bank|Punjab National|Bank of Baroda|Canara Bank|IDFC First)"],
    }
    for key, pats in patterns.items():
        for pat in pats:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                meta[key] = m.group(1).strip()
                break


# ── Excel parser ─────────────────────────────────────────────────────────────

def _extract_from_excel(content: bytes, filename: str) -> tuple[list[Transaction], dict]:
    transactions: list[Transaction] = []
    meta: dict = {"account_number": "", "account_holder": "", "bank_name": "", "ifsc": ""}

    ext = Path(filename).suffix.lower()
    engine = "xlrd" if ext == ".xls" else "openpyxl"

    try:
        xl = pd.ExcelFile(BytesIO(content), engine=engine)
    except Exception as e:
        logger.error(f"Excel open failed: {e}")
        return transactions, meta

    for sheet in xl.sheet_names:
        df = xl.parse(sheet, header=None)

        # Find the header row (contains "date" or "narration")
        header_row = None
        for i, row in df.iterrows():
            row_str = " ".join(str(v).lower() for v in row if pd.notna(v))
            if any(k in row_str for k in ["date", "narration", "particulars"]):
                header_row = i
                break

        if header_row is None:
            continue

        df.columns = df.iloc[header_row]
        df = df.iloc[header_row + 1:].reset_index(drop=True)
        df = _normalise_columns(df)
        if df is None:
            continue

        for _, row in df.iterrows():
            date = _parse_date(row.get("date"))
            if date is None:
                continue
            narration = str(row.get("narration", "")).strip()
            transactions.append(Transaction(
                date=date,
                narration=narration,
                debit=_to_float(row.get("debit", 0)),
                credit=_to_float(row.get("credit", 0)),
                balance=_to_float(row.get("balance", 0)),
                category=_categorise(narration),
            ))

    return transactions, meta


# ── Analytics ────────────────────────────────────────────────────────────────

def _compute_analytics(transactions: list[Transaction]) -> tuple[list[MonthlySummary], dict]:
    if not transactions:
        return [], {}

    df = pd.DataFrame([{
        "date": t.date,
        "debit": t.debit,
        "credit": t.credit,
        "balance": t.balance,
        "category": t.category,
    } for t in transactions])

    df["month"] = df["date"].dt.to_period("M").astype(str)

    monthly: list[MonthlySummary] = []
    for month, grp in df.groupby("month"):
        bounces = (grp["category"] == "cheque_bounce").sum()
        emi_debits = grp.loc[grp["category"] == "emi_debit", "debit"].sum()
        monthly.append(MonthlySummary(
            month=str(month),
            total_credits=grp["credit"].sum(),
            total_debits=grp["debit"].sum(),
            closing_balance=grp["balance"].iloc[-1],
            bounce_count=int(bounces),
            emi_debits=emi_debits,
            avg_balance=grp["balance"].mean(),
        ))

    total_credits = df["credit"].sum()
    total_debits = df["debit"].sum()
    bounce_count = int((df["category"] == "cheque_bounce").sum())
    cash_wd = df.loc[df["category"] == "cash_withdrawal", "debit"].sum()
    emi_monthly = df.loc[df["category"] == "emi_debit", "debit"].sum() / max(len(monthly), 1)

    aggregates = {
        "total_credits_12m": round(total_credits, 2),
        "total_debits_12m": round(total_debits, 2),
        "average_monthly_bank_credit": round(total_credits / max(len(monthly), 1), 2),
        "average_eod_balance": round(df["balance"].mean(), 2),
        "bounce_count_12m": bounce_count,
        "emi_obligations_monthly": round(emi_monthly, 2),
        "inward_outward_ratio": round(total_credits / total_debits, 3) if total_debits else 0,
        "cash_withdrawal_pct": round(cash_wd / total_debits * 100, 1) if total_debits else 0,
    }

    return monthly, aggregates


def _generate_flags(aggregates: dict, monthly: list[MonthlySummary]) -> list[str]:
    flags: list[str] = []

    if aggregates.get("bounce_count_12m", 0) > 2:
        flags.append(f"HIGH BOUNCE COUNT: {aggregates['bounce_count_12m']} bounces in statement period")

    if aggregates.get("cash_withdrawal_pct", 0) > 40:
        flags.append(f"HIGH CASH WITHDRAWAL: {aggregates['cash_withdrawal_pct']}% of debits are cash")

    if aggregates.get("inward_outward_ratio", 1) < 0.8:
        flags.append("DEBIT-HEAVY ACCOUNT: outflows consistently exceed inflows")

    if aggregates.get("average_eod_balance", 999999) < 10000:
        flags.append("LOW AVERAGE BALANCE: average end-of-day balance below ₹10,000")

    # Check for closing balance going negative
    negative_months = [m.month for m in monthly if m.closing_balance < 0]
    if negative_months:
        flags.append(f"NEGATIVE BALANCE in months: {', '.join(negative_months)}")

    # Irregular credits — high variance
    credits = [m.total_credits for m in monthly if m.total_credits > 0]
    if len(credits) >= 3:
        mean_c = sum(credits) / len(credits)
        variance_pct = (max(credits) - min(credits)) / mean_c * 100 if mean_c else 0
        if variance_pct > 150:
            flags.append(f"HIGHLY IRREGULAR CREDITS: monthly credit variance {variance_pct:.0f}%")

    return flags


# ── Public interface ──────────────────────────────────────────────────────────

def parse_bank_statement(content: bytes, filename: str) -> BankStatementResult:
    """
    Parse a bank statement PDF or Excel file.
    Returns a BankStatementResult with transactions, monthly summaries, and risk flags.
    """
    logger.info(f"Parsing bank statement: {filename}")
    ext = Path(filename).suffix.lower()

    if ext in (".xlsx", ".xls", ".csv"):
        if ext == ".csv":
            df = pd.read_csv(BytesIO(content))
            df = _normalise_columns(df)
            transactions, meta = [], {"account_number": "", "account_holder": "", "bank_name": "", "ifsc": ""}
            if df is not None:
                for _, row in df.iterrows():
                    date = _parse_date(row.get("date"))
                    if date:
                        narration = str(row.get("narration", "")).strip()
                        transactions.append(Transaction(
                            date=date, narration=narration,
                            debit=_to_float(row.get("debit", 0)),
                            credit=_to_float(row.get("credit", 0)),
                            balance=_to_float(row.get("balance", 0)),
                            category=_categorise(narration),
                        ))
        else:
            transactions, meta = _extract_from_excel(content, filename)
    else:
        transactions, meta = _extract_from_pdf(content)

    transactions.sort(key=lambda t: t.date)

    monthly, aggregates = _compute_analytics(transactions)
    flags = _generate_flags(aggregates, monthly)

    period_from = transactions[0].date if transactions else None
    period_to = transactions[-1].date if transactions else None
    confidence = min(1.0, len(transactions) / 50) if transactions else 0.0

    logger.info(f"Parsed {len(transactions)} transactions, {len(flags)} flags raised")

    return BankStatementResult(
        account_number=meta.get("account_number", ""),
        account_holder=meta.get("account_holder", ""),
        bank_name=meta.get("bank_name", ""),
        ifsc=meta.get("ifsc", ""),
        statement_period_from=period_from,
        statement_period_to=period_to,
        transactions=transactions,
        monthly_summaries=monthly,
        **aggregates,
        flags=flags,
        extraction_confidence=round(confidence, 2),
    )
