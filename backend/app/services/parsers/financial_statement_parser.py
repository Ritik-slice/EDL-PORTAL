"""
Financial Statement Parser
Parses Balance Sheet and P&L from PDF/Excel, auto-spreads, and computes credit ratios.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from io import BytesIO
from typing import Optional

import pandas as pd
import pdfplumber
from loguru import logger


# ── Data structures ─────────────────────────────────────────────────────────

@dataclass
class ProfitAndLoss:
    year: str
    revenue: float
    cost_of_goods_sold: float
    gross_profit: float
    operating_expenses: float
    ebitda: float
    depreciation: float
    ebit: float
    interest: float
    pbt: float
    tax: float
    pat: float
    # Margins
    gross_margin_pct: float = 0.0
    ebitda_margin_pct: float = 0.0
    net_margin_pct: float = 0.0


@dataclass
class BalanceSheet:
    year: str
    # Assets
    cash_and_bank: float
    trade_receivables: float
    inventory: float
    other_current_assets: float
    total_current_assets: float
    fixed_assets_net: float
    total_assets: float
    # Liabilities
    trade_payables: float
    short_term_borrowings: float
    other_current_liabilities: float
    total_current_liabilities: float
    long_term_borrowings: float
    total_debt: float
    net_worth: float
    total_liabilities: float


@dataclass
class FinancialRatios:
    year: str
    current_ratio: float           # Current Assets / Current Liabilities
    quick_ratio: float             # (CA - Inventory) / CL
    debt_equity_ratio: float       # Total Debt / Net Worth
    dscr: float                    # (PAT + Depreciation + Interest) / (Principal + Interest)
    interest_coverage: float       # EBIT / Interest
    roe: float                     # PAT / Net Worth * 100
    roa: float                     # PAT / Total Assets * 100
    asset_turnover: float          # Revenue / Total Assets
    debtor_days: float             # (Trade Receivables / Revenue) * 365
    creditor_days: float           # (Trade Payables / COGS) * 365
    inventory_days: float          # (Inventory / COGS) * 365
    nwc: float                     # Net Working Capital = CA - CL


@dataclass
class FinancialStatementResult:
    entity_name: str
    pan: str
    years_available: list[str]
    pnl: list[ProfitAndLoss]
    balance_sheets: list[BalanceSheet]
    ratios: list[FinancialRatios]
    flags: list[str] = field(default_factory=list)
    extraction_confidence: float = 0.0


# ── Line-item keyword map ────────────────────────────────────────────────────

_PNL_KEYWORDS: dict[str, list[str]] = {
    "revenue": ["revenue from operations", "net revenue", "net sales", "turnover", "total income"],
    "cogs": ["cost of goods sold", "cost of materials", "purchases", "direct expenses", "cost of revenue"],
    "gross_profit": ["gross profit"],
    "operating_expenses": ["operating expenses", "selling expenses", "admin expenses", "overheads"],
    "ebitda": ["ebitda", "operating profit"],
    "depreciation": ["depreciation", "amortisation", "d&a"],
    "interest": ["finance cost", "interest expense", "interest paid", "borrowing cost"],
    "pbt": ["profit before tax", "pbt", "net profit before tax"],
    "tax": ["tax expense", "income tax", "current tax", "deferred tax"],
    "pat": ["profit after tax", "pat", "net profit", "profit for the year"],
}

_BS_KEYWORDS: dict[str, list[str]] = {
    "cash_and_bank": ["cash and cash equivalents", "cash and bank", "cash at bank"],
    "trade_receivables": ["trade receivables", "debtors", "accounts receivable", "sundry debtors"],
    "inventory": ["inventories", "inventory", "stock"],
    "total_current_assets": ["total current assets", "current assets total"],
    "fixed_assets_net": ["net fixed assets", "property plant and equipment", "tangible assets"],
    "total_assets": ["total assets"],
    "trade_payables": ["trade payables", "creditors", "accounts payable", "sundry creditors"],
    "short_term_borrowings": ["short term borrowings", "current maturities", "bank od", "working capital loan"],
    "total_current_liabilities": ["total current liabilities"],
    "long_term_borrowings": ["long term borrowings", "term loans", "long term debt"],
    "total_debt": ["total debt", "total borrowings"],
    "net_worth": ["net worth", "shareholders funds", "equity", "total equity"],
    "total_liabilities": ["total liabilities and equity", "total liabilities", "balance sheet total"],
}


def _match_keyword(label: str, keyword_map: dict) -> Optional[str]:
    label_lower = label.lower().strip()
    for field_name, keywords in keyword_map.items():
        for kw in keywords:
            if kw in label_lower or label_lower in kw:
                return field_name
    return None


def _safe_float(val) -> float:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return 0.0
    s = str(val).replace(",", "").replace("(", "-").replace(")", "").replace("₹", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


# ── PDF extraction ───────────────────────────────────────────────────────────

def _extract_tables_from_pdf(content: bytes) -> list[pd.DataFrame]:
    dfs: list[pd.DataFrame] = []
    with pdfplumber.open(BytesIO(content)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                if table and len(table) > 3:
                    df = pd.DataFrame(table)
                    dfs.append(df)
    return dfs


def _extract_tables_from_excel(content: bytes, filename: str) -> list[pd.DataFrame]:
    ext = filename.split(".")[-1].lower()
    engine = "xlrd" if ext == "xls" else "openpyxl"
    xl = pd.ExcelFile(BytesIO(content), engine=engine)
    return [xl.parse(s, header=None) for s in xl.sheet_names]


# ── Spreader ─────────────────────────────────────────────────────────────────

def _spread_table(df: pd.DataFrame) -> dict:
    """
    Given a table DataFrame, try to extract label→year→value mapping.
    Handles multi-year comparative statements.
    """
    result: dict[str, dict[str, float]] = {}

    # Detect year columns: look for 4-digit years in any cell
    year_cols: dict[int, str] = {}
    for col_idx in range(df.shape[1]):
        for row_idx in range(min(5, df.shape[0])):
            cell = str(df.iloc[row_idx, col_idx])
            m = re.search(r"(20\d{2})", cell)
            if m:
                year_cols[col_idx] = m.group(1)
                break

    if not year_cols:
        return result

    for _, row in df.iterrows():
        label = str(row.iloc[0]).strip()
        if not label or label.lower() in ("nan", "none", ""):
            continue

        for col_idx, year in year_cols.items():
            try:
                val = _safe_float(row.iloc[col_idx])
                if val != 0:
                    if label not in result:
                        result[label] = {}
                    result[label][year] = val
            except IndexError:
                continue

    return result


def _build_pnl(spread: dict, year: str) -> ProfitAndLoss:
    def g(field_name: str) -> float:
        for label, years in spread.items():
            if _match_keyword(label, _PNL_KEYWORDS) == field_name:
                return years.get(year, 0.0)
        return 0.0

    rev = g("revenue")
    cogs = g("cogs")
    gp = rev - cogs if not g("gross_profit") else g("gross_profit")
    ebitda = g("ebitda") or (gp - g("operating_expenses"))
    dep = g("depreciation")
    interest = g("interest")
    pbt = g("pbt") or (ebitda - dep - interest)
    tax = g("tax")
    pat = g("pat") or (pbt - tax)

    return ProfitAndLoss(
        year=year, revenue=rev, cost_of_goods_sold=cogs,
        gross_profit=gp, operating_expenses=g("operating_expenses"),
        ebitda=ebitda, depreciation=dep, ebit=ebitda - dep,
        interest=interest, pbt=pbt, tax=tax, pat=pat,
        gross_margin_pct=round(gp / rev * 100, 1) if rev else 0,
        ebitda_margin_pct=round(ebitda / rev * 100, 1) if rev else 0,
        net_margin_pct=round(pat / rev * 100, 1) if rev else 0,
    )


def _build_bs(spread: dict, year: str) -> BalanceSheet:
    def g(field_name: str) -> float:
        for label, years in spread.items():
            if _match_keyword(label, _BS_KEYWORDS) == field_name:
                return years.get(year, 0.0)
        return 0.0

    ca = g("total_current_assets") or (g("cash_and_bank") + g("trade_receivables") + g("inventory"))
    cl = g("total_current_liabilities") or (g("trade_payables") + g("short_term_borrowings"))
    total_debt = g("total_debt") or (g("short_term_borrowings") + g("long_term_borrowings"))

    return BalanceSheet(
        year=year,
        cash_and_bank=g("cash_and_bank"),
        trade_receivables=g("trade_receivables"),
        inventory=g("inventory"),
        other_current_assets=max(0, ca - g("cash_and_bank") - g("trade_receivables") - g("inventory")),
        total_current_assets=ca,
        fixed_assets_net=g("fixed_assets_net"),
        total_assets=g("total_assets") or (ca + g("fixed_assets_net")),
        trade_payables=g("trade_payables"),
        short_term_borrowings=g("short_term_borrowings"),
        other_current_liabilities=max(0, cl - g("trade_payables") - g("short_term_borrowings")),
        total_current_liabilities=cl,
        long_term_borrowings=g("long_term_borrowings"),
        total_debt=total_debt,
        net_worth=g("net_worth"),
        total_liabilities=g("total_liabilities") or (cl + g("long_term_borrowings") + g("net_worth")),
    )


def _compute_ratios(pnl: ProfitAndLoss, bs: BalanceSheet, loan_principal_annual: float = 0) -> FinancialRatios:
    def safe_div(a, b): return round(a / b, 2) if b else 0.0

    dscr_numerator = pnl.pat + pnl.depreciation + pnl.interest
    dscr_denominator = loan_principal_annual + pnl.interest
    dscr = safe_div(dscr_numerator, dscr_denominator) if dscr_denominator else 0.0

    return FinancialRatios(
        year=pnl.year,
        current_ratio=safe_div(bs.total_current_assets, bs.total_current_liabilities),
        quick_ratio=safe_div(bs.total_current_assets - bs.inventory, bs.total_current_liabilities),
        debt_equity_ratio=safe_div(bs.total_debt, bs.net_worth),
        dscr=dscr,
        interest_coverage=safe_div(pnl.ebit, pnl.interest),
        roe=safe_div(pnl.pat, bs.net_worth) * 100,
        roa=safe_div(pnl.pat, bs.total_assets) * 100,
        asset_turnover=safe_div(pnl.revenue, bs.total_assets),
        debtor_days=safe_div(bs.trade_receivables * 365, pnl.revenue),
        creditor_days=safe_div(bs.trade_payables * 365, pnl.cost_of_goods_sold) if pnl.cost_of_goods_sold else 0,
        inventory_days=safe_div(bs.inventory * 365, pnl.cost_of_goods_sold) if pnl.cost_of_goods_sold else 0,
        nwc=bs.total_current_assets - bs.total_current_liabilities,
    )


def _generate_flags(ratios: list[FinancialRatios], pnl: list[ProfitAndLoss]) -> list[str]:
    flags: list[str] = []

    for r in ratios:
        if r.dscr and r.dscr < 1.25:
            flags.append(f"LOW DSCR {r.year}: {r.dscr} (minimum threshold 1.25)")
        if r.current_ratio and r.current_ratio < 1.0:
            flags.append(f"POOR LIQUIDITY {r.year}: current ratio {r.current_ratio}")
        if r.debt_equity_ratio and r.debt_equity_ratio > 3.0:
            flags.append(f"HIGH LEVERAGE {r.year}: D/E ratio {r.debt_equity_ratio}")

    if len(pnl) >= 2:
        rev_trend = [p.revenue for p in pnl]
        if rev_trend[-1] < rev_trend[0] * 0.8:
            flags.append(f"DECLINING REVENUE: fell from ₹{rev_trend[0]:,.0f} to ₹{rev_trend[-1]:,.0f}")
        pat_trend = [p.pat for p in pnl]
        if any(p < 0 for p in pat_trend):
            loss_years = [pnl[i].year for i, p in enumerate(pat_trend) if p < 0]
            flags.append(f"NET LOSSES recorded in: {', '.join(loss_years)}")

    return flags


# ── Public interface ──────────────────────────────────────────────────────────

def parse_financial_statement(
    content: bytes,
    filename: str,
    loan_amount: float = 0,
    loan_tenor_months: int = 60,
) -> FinancialStatementResult:
    logger.info(f"Parsing financial statement: {filename}")

    ext = filename.split(".")[-1].lower()
    if ext in ("xlsx", "xls"):
        dfs = _extract_tables_from_excel(content, filename)
    else:
        dfs = _extract_tables_from_pdf(content)

    # Merge all spreads from all tables
    combined_spread: dict = {}
    for df in dfs:
        spread = _spread_table(df)
        for label, year_vals in spread.items():
            if label not in combined_spread:
                combined_spread[label] = {}
            combined_spread[label].update(year_vals)

    years = sorted({yr for vals in combined_spread.values() for yr in vals.keys()})
    if not years:
        logger.warning("No year columns detected in financial statement")
        return FinancialStatementResult(
            entity_name="", pan="", years_available=[],
            pnl=[], balance_sheets=[], ratios=[],
            flags=["PARSE FAILED: no structured financial data detected"],
            extraction_confidence=0.0,
        )

    annual_principal = (loan_amount / loan_tenor_months * 12) if loan_tenor_months else 0

    pnl_list = [_build_pnl(combined_spread, yr) for yr in years]
    bs_list = [_build_bs(combined_spread, yr) for yr in years]
    ratios_list = [_compute_ratios(p, b, annual_principal) for p, b in zip(pnl_list, bs_list)]
    flags = _generate_flags(ratios_list, pnl_list)

    return FinancialStatementResult(
        entity_name="",  # extracted separately from KYC/cover page
        pan="",
        years_available=years,
        pnl=pnl_list,
        balance_sheets=bs_list,
        ratios=ratios_list,
        flags=flags,
        extraction_confidence=min(1.0, len(years) / 3),
    )
