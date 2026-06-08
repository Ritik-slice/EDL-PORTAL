"""
GST Return Parser
Supports GSTR-3B and GSTR-1 in JSON (portal download) and structured PDF format.
Extracts monthly turnover, ITC, tax paid, and filing regularity.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from io import BytesIO
from typing import Optional

import pdfplumber
from loguru import logger


@dataclass
class GSTMonthlyEntry:
    period: str            # "Jan-2024"
    turnover: float        # outward supplies
    itc_claimed: float     # input tax credit
    igst_paid: float
    cgst_paid: float
    sgst_paid: float
    total_tax_paid: float
    filed: bool
    filing_date: Optional[datetime] = None


@dataclass
class GSTResult:
    gstin: str
    trade_name: str
    legal_name: str
    registration_date: Optional[datetime]
    return_type: str          # GSTR-3B or GSTR-1
    entries: list[GSTMonthlyEntry]

    # Aggregates
    total_turnover_annual: float
    average_monthly_turnover: float
    total_itc_claimed: float
    total_tax_paid: float
    filing_regularity_pct: float   # % of months filed on time

    # Validation
    missing_periods: list[str]
    flags: list[str] = field(default_factory=list)
    extraction_confidence: float = 0.0


# ── JSON parser (GST portal download) ───────────────────────────────────────

def _parse_gstr3b_json(data: dict) -> tuple[list[GSTMonthlyEntry], dict]:
    """Parse GSTR-3B JSON as downloaded from GST portal."""
    entries: list[GSTMonthlyEntry] = []
    meta = {"gstin": "", "trade_name": "", "legal_name": "", "registration_date": None}

    # Portal format varies; handle both wrapped and flat
    returns = data.get("returns", [data]) if "returns" in data else [data]

    for ret in returns:
        period = ret.get("ret_period", ret.get("fp", ""))
        if not period:
            continue

        sup_details = ret.get("sup_details", {})
        itc = ret.get("itc_elg", {}).get("itc_avl", {})
        tax = ret.get("intr_ltfee", {})

        osup_total = sup_details.get("osup_det", {})
        turnover = _safe_float(osup_total.get("txval", 0))
        itc_claimed = sum(_safe_float(itc.get(k, 0)) for k in ["iseg", "cseg", "sseg"])
        igst = _safe_float(ret.get("intr_ltfee", {}).get("igst", 0))
        cgst = _safe_float(ret.get("intr_ltfee", {}).get("cgst", 0))
        sgst = _safe_float(ret.get("intr_ltfee", {}).get("sgst", 0))

        entries.append(GSTMonthlyEntry(
            period=_format_period(period),
            turnover=turnover,
            itc_claimed=itc_claimed,
            igst_paid=igst,
            cgst_paid=cgst,
            sgst_paid=sgst,
            total_tax_paid=igst + cgst + sgst,
            filed=True,
        ))

    return entries, meta


def _safe_float(val) -> float:
    try:
        return float(val or 0)
    except (TypeError, ValueError):
        return 0.0


def _format_period(raw: str) -> str:
    """Convert MMYYYY or YYYY-MM to human period."""
    try:
        if len(raw) == 6 and raw.isdigit():  # MMYYYY
            return datetime.strptime(raw, "%m%Y").strftime("%b-%Y")
        return datetime.strptime(raw, "%Y-%m").strftime("%b-%Y")
    except ValueError:
        return raw


# ── PDF parser ───────────────────────────────────────────────────────────────

_AMOUNT_RE = re.compile(r"[\d,]+\.?\d*")


def _parse_gst_pdf(content: bytes) -> tuple[list[GSTMonthlyEntry], dict]:
    entries: list[GSTMonthlyEntry] = []
    meta = {"gstin": "", "trade_name": "", "legal_name": "", "registration_date": None}

    months_seen: dict[str, GSTMonthlyEntry] = {}

    with pdfplumber.open(BytesIO(content)) as pdf:
        full_text = ""
        for page in pdf.pages:
            full_text += (page.extract_text() or "") + "\n"

        # Extract GSTIN
        m = re.search(r"\b(\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1})\b", full_text)
        if m:
            meta["gstin"] = m.group(1)

        # Extract trade name
        m = re.search(r"Trade\s*Name[:\s]+([A-Z][A-Z\s&]+)", full_text)
        if m:
            meta["trade_name"] = m.group(1).strip()

        # Scan for monthly rows — heuristic: look for "Apr-2023" style labels near amounts
        month_pattern = re.compile(
            r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[- ](\d{4})"
            r"[^\d]+([\d,]+\.?\d*)[^\d]+([\d,]+\.?\d*)"
        )
        for match in month_pattern.finditer(full_text):
            period = f"{match.group(1)}-{match.group(2)}"
            if period in months_seen:
                continue
            turnover = _safe_float(match.group(3).replace(",", ""))
            tax = _safe_float(match.group(4).replace(",", ""))
            months_seen[period] = GSTMonthlyEntry(
                period=period, turnover=turnover, itc_claimed=0,
                igst_paid=0, cgst_paid=0, sgst_paid=0, total_tax_paid=tax, filed=True,
            )

    return list(months_seen.values()), meta


# ── Missing period detector ──────────────────────────────────────────────────

def _detect_missing_periods(entries: list[GSTMonthlyEntry]) -> list[str]:
    if not entries:
        return []

    months = []
    for e in entries:
        try:
            months.append(datetime.strptime(e.period, "%b-%Y"))
        except ValueError:
            continue

    if not months:
        return []

    months.sort()
    missing = []
    current = months[0]
    while current <= months[-1]:
        label = current.strftime("%b-%Y")
        if label not in {e.period for e in entries}:
            missing.append(label)
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)

    return missing


# ── Flag generator ───────────────────────────────────────────────────────────

def _generate_flags(entries: list[GSTMonthlyEntry], missing: list[str], aggregates: dict) -> list[str]:
    flags: list[str] = []

    if missing:
        flags.append(f"GST FILING GAPS: returns missing for {', '.join(missing)}")

    # Low tax vs turnover ratio
    if aggregates["total_turnover_annual"] > 0:
        effective_rate = aggregates["total_tax_paid"] / aggregates["total_turnover_annual"] * 100
        if effective_rate < 0.5:
            flags.append(f"VERY LOW EFFECTIVE TAX RATE: {effective_rate:.1f}% on declared turnover")

    # Sudden turnover spike
    turnovers = [e.turnover for e in entries if e.turnover > 0]
    if len(turnovers) >= 3:
        avg = sum(turnovers) / len(turnovers)
        spikes = [t for t in turnovers if t > avg * 2.5]
        if spikes:
            flags.append(f"TURNOVER SPIKES DETECTED: {len(spikes)} months with >2.5x average turnover")

    return flags


# ── Public interface ──────────────────────────────────────────────────────────

def parse_gst_return(content: bytes, filename: str) -> GSTResult:
    logger.info(f"Parsing GST return: {filename}")

    if filename.lower().endswith(".json"):
        try:
            data = json.loads(content.decode("utf-8"))
            entries, meta = _parse_gstr3b_json(data)
            return_type = "GSTR-3B"
        except json.JSONDecodeError:
            logger.warning("JSON parse failed, falling back to PDF")
            entries, meta = [], {}
            return_type = "unknown"
    else:
        entries, meta = _parse_gst_pdf(content)
        return_type = "GSTR-3B (PDF)"

    entries.sort(key=lambda e: e.period)
    missing = _detect_missing_periods(entries)
    total_turnover = sum(e.turnover for e in entries)
    total_itc = sum(e.itc_claimed for e in entries)
    total_tax = sum(e.total_tax_paid for e in entries)
    avg_monthly = total_turnover / max(len(entries), 1)
    filing_pct = len(entries) / max(len(entries) + len(missing), 1) * 100

    aggregates = {
        "total_turnover_annual": round(total_turnover, 2),
        "average_monthly_turnover": round(avg_monthly, 2),
        "total_itc_claimed": round(total_itc, 2),
        "total_tax_paid": round(total_tax, 2),
        "filing_regularity_pct": round(filing_pct, 1),
    }

    flags = _generate_flags(entries, missing, aggregates)
    confidence = min(1.0, len(entries) / 12)

    reg_date_raw = meta.get("registration_date")
    reg_date = datetime.strptime(reg_date_raw, "%d/%m/%Y") if isinstance(reg_date_raw, str) else None

    return GSTResult(
        gstin=meta.get("gstin", ""),
        trade_name=meta.get("trade_name", ""),
        legal_name=meta.get("legal_name", ""),
        registration_date=reg_date,
        return_type=return_type,
        entries=entries,
        missing_periods=missing,
        flags=flags,
        extraction_confidence=round(confidence, 2),
        **aggregates,
    )
