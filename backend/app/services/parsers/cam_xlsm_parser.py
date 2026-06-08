"""
Parser for .xlsm CAM Excel files from Slice's lending platform.

Extracts data from 40+ sheets including application details, bureau scores,
banking, GST, financials, scorecard, deviations, and more. Tracks editable
(yellow-highlighted) cells for underwriter workflow.
"""

import io
import logging
from typing import Any, Optional

import openpyxl
from openpyxl.cell.cell import Cell
from openpyxl.utils import get_column_letter

logger = logging.getLogger(__name__)

# Yellow-ish fill colors indicating editable cells
_YELLOW_COLORS = {
    "FFFFFF00", "FFFBFF8E", "FFFFFFFF", "FFFFFF99",
    "FFFFFFCC", "FFFFF2CC", "FFFFFFE0", "FFFBFF00",
}


def _is_yellow(cell: Cell) -> bool:
    """Check if a cell has a yellow background fill (editable marker)."""
    try:
        fill = cell.fill
        if fill and fill.fgColor and fill.fgColor.rgb:
            rgb = str(fill.fgColor.rgb).upper()
            if rgb in _YELLOW_COLORS:
                return True
            # Heuristic: high R, high G, low B with FF alpha
            if len(rgb) == 8 and rgb.startswith("FF"):
                r, g, b = int(rgb[2:4], 16), int(rgb[4:6], 16), int(rgb[6:8], 16)
                if r > 200 and g > 200 and b < 150:
                    return True
        if fill and fill.bgColor and fill.bgColor.rgb:
            rgb = str(fill.bgColor.rgb).upper()
            if rgb in _YELLOW_COLORS:
                return True
    except Exception:
        pass
    return False


def _safe_value(cell: Cell) -> Any:
    """Extract cell value, converting formula errors to None."""
    if cell is None:
        return None
    v = cell.value
    if isinstance(v, str) and v.startswith(("#REF!", "#N/A", "#VALUE!", "#DIV/0!", "#NAME?")):
        return None
    return v


def _safe_str(val: Any) -> Optional[str]:
    if val is None:
        return None
    return str(val).strip() or None


def _safe_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _safe_int(val: Any) -> Optional[int]:
    f = _safe_float(val)
    if f is None:
        return None
    return int(f)


def _get_sheet(wb, name: str):
    """Get sheet by name, case-insensitive. Returns None if not found."""
    for sn in wb.sheetnames:
        if sn.lower() == name.lower():
            return wb[sn]
    logger.warning("Sheet '%s' not found in workbook", name)
    return None


def _cell_ref(sheet_name: str, row: int, col: int) -> str:
    return f"{sheet_name}!{get_column_letter(col)}{row}"


def _track_editable(
    editable_fields: list,
    ws,
    sheet_name: str,
    row: int,
    col: int,
    key: Optional[str] = None,
):
    """If cell is yellow, add to editable_fields tracker."""
    cell = ws.cell(row=row, column=col)
    if _is_yellow(cell):
        editable_fields.append({
            "sheet": sheet_name,
            "cell": f"{get_column_letter(col)}{row}",
            "key": key,
            "current_value": _safe_value(cell),
        })


def _parse_processed_data_basic(wb, editable_fields: list) -> dict:
    ws = _get_sheet(wb, "Processed_Data_Basic")
    if ws is None:
        return {}

    result = {}
    # Rows 3-38, cols B(2) to AU(47). Layout is label in one col, value in next.
    # Read all cells into a flat map by scanning row by row.
    data = {}
    for row in range(3, 39):
        for col in range(2, 48):
            val = _safe_value(ws.cell(row=row, column=col))
            if val is not None:
                data[(row, col)] = val
            _track_editable(editable_fields, ws, "Processed_Data_Basic", row, col)

    # Extract known fields by scanning label-value pairs (label in col, value in col+1)
    label_map = {}
    for row in range(3, 39):
        for col in range(2, 47):
            cell_val = _safe_str(data.get((row, col)))
            if cell_val:
                label_map[cell_val.lower().strip().rstrip(":")] = data.get((row, col + 1))

    # Map known fields
    field_mappings = {
        "applied date": "applied_date",
        "cam id": "cam_id",
        "branch": "branch",
        "loan amount": "loan_amount",
        "loan type": "loan_type",
        "app id": "app_id",
        "application id": "app_id",
        "pan number": "pan_number",
        "pan status": "pan_status",
        "udyam number": "udyam_number",
        "business name": "business_name",
        "constitution": "constitution",
        "registration date": "registration_date",
        "nature of business": "nature_of_business",
        "business type": "business_type",
        "date of commencement": "date_of_commencement",
        "enterprise type": "enterprise_type",
        "social category": "social_category",
        "applicant name": "applicant_name",
        "name": "applicant_name",
        "mobile": "mobile",
        "email": "email",
        "dob": "dob",
        "date of birth": "dob",
        "age": "age",
        "father's name": "fathers_name",
        "father name": "fathers_name",
        "occupation": "occupation",
        "aadhar address": "aadhar_address",
        "current address": "current_address",
        "primary security": "primary_security",
        "secondary security": "secondary_security",
        "annual turnover": "annual_turnover",
        "net margin": "net_margin",
        "monthly sales": "monthly_sales",
        "current stock value": "current_stock_value",
        "address ownership": "address_ownership",
        "gst registration date": "gst_registration_date",
        "gst reg date": "gst_registration_date",
        "gst number": "gst_number",
        "business vintage": "business_vintage",
    }

    for label_key, field_name in field_mappings.items():
        if label_key in label_map:
            result[field_name] = label_map[label_key]

    # Co-applicants (up to 4)
    co_applicants = []
    for i in range(1, 5):
        prefix_variants = [f"co-applicant {i}", f"co applicant {i}", f"coapplicant {i}", f"co-borrower {i}"]
        co = {}
        for label_key, val in label_map.items():
            for pv in prefix_variants:
                if label_key.startswith(pv):
                    field = label_key.replace(pv, "").strip().lstrip("-").strip()
                    if field:
                        co[field.replace(" ", "_")] = val
        if co:
            co_applicants.append(co)

    if co_applicants:
        result["co_applicants"] = co_applicants

    # References
    refs = []
    for label_key, val in label_map.items():
        if "reference" in label_key and val:
            refs.append({"label": label_key, "value": val})
    if refs:
        result["references"] = refs

    # Store full label map for anything we missed
    result["_raw_labels"] = {k: v for k, v in label_map.items() if v is not None}

    return result


def _parse_output(wb, editable_fields: list) -> dict:
    ws = _get_sheet(wb, "Output")
    if ws is None:
        return {}

    result = {}
    for row in range(1, 170):
        key = _safe_str(_safe_value(ws.cell(row=row, column=1)))
        value = _safe_value(ws.cell(row=row, column=2))
        if key:
            result[key] = value
            _track_editable(editable_fields, ws, "Output", row, 2, key)
    return result


def _parse_demographic(wb, editable_fields: list) -> dict:
    ws = _get_sheet(wb, "Demographic")
    if ws is None:
        return {}

    result = {}
    current_section = "general"
    for row in range(1, 125):
        b = _safe_str(_safe_value(ws.cell(row=row, column=2)))
        c = _safe_value(ws.cell(row=row, column=3))
        d = _safe_str(_safe_value(ws.cell(row=row, column=4)))
        e = _safe_value(ws.cell(row=row, column=5))

        # Detect section headers
        if b and not c and not d:
            section_lower = b.lower()
            if any(kw in section_lower for kw in [
                "sourcing", "loan application", "business", "co-borrower", "co-applicant"
            ]):
                current_section = b.strip()
                if current_section not in result:
                    result[current_section] = {}
                continue

        section_dict = result.setdefault(current_section, {})
        if b and c is not None:
            section_dict[b] = c
            _track_editable(editable_fields, ws, "Demographic", row, 3)
        if d and e is not None:
            section_dict[d] = e
            _track_editable(editable_fields, ws, "Demographic", row, 5)

    return result


def _parse_bureau(wb, editable_fields: list) -> dict:
    ws = _get_sheet(wb, "Bureau")
    if ws is None:
        return {"scores": [], "existing_loans": [], "commercial_bureau": {}}

    scores = []
    # Row 3 is header, row 4 is Business, rows 5+ are applicants
    # Cols: A=Applicant Index, B=Applicant type, C=Name, D=Provider, E=Score, F=Fetch date, G=NTC Flag
    for row in range(4, 16):
        applicant_type = _safe_str(_safe_value(ws.cell(row=row, column=2)))
        if not applicant_type:
            continue
        name = _safe_value(ws.cell(row=row, column=3))
        provider = _safe_str(_safe_value(ws.cell(row=row, column=4)))
        score_val = _safe_value(ws.cell(row=row, column=5))
        # Try to get numeric score
        numeric_score = None
        try:
            numeric_score = int(float(score_val)) if score_val else None
        except (ValueError, TypeError):
            pass
        score_entry = {
            "applicant_index": _safe_value(ws.cell(row=row, column=1)),
            "type": applicant_type,
            "name": name,
            "provider": provider,
            "score": numeric_score,
            "score_raw": score_val,
            "fetch_date": _safe_value(ws.cell(row=row, column=6)),
            "ntc_flag": _safe_value(ws.cell(row=row, column=7)),
        }
        scores.append(score_entry)
        for col in range(1, 8):
            _track_editable(editable_fields, ws, "Bureau", row, col)

    # Commercial Bureau (row 4, cols J/K/L)
    commercial_bureau = {
        "name": _safe_value(ws.cell(row=4, column=10)),
        "score": _safe_value(ws.cell(row=4, column=11)),
        "details": _safe_value(ws.cell(row=4, column=12)),
    }
    for col in [10, 11, 12]:
        _track_editable(editable_fields, ws, "Bureau", 4, col, f"commercial_bureau_col{col}")

    # Existing Loans (rows 18+)
    existing_loans = []
    for row in range(18, 92):
        applicant_idx = _safe_value(ws.cell(row=row, column=2))
        if applicant_idx is None:
            continue
        loan = {
            "applicant_index": applicant_idx,
            "borrower": _safe_value(ws.cell(row=row, column=3)),
            "financier": _safe_value(ws.cell(row=row, column=4)),
            "loan_type": _safe_value(ws.cell(row=row, column=5)),
            "amount": _safe_value(ws.cell(row=row, column=6)),
            "pos": _safe_value(ws.cell(row=row, column=7)),
            "term": _safe_value(ws.cell(row=row, column=8)),
            "mob": _safe_value(ws.cell(row=row, column=9)),
            "emi_assessed": _safe_value(ws.cell(row=row, column=10)),
            "obligated": _safe_value(ws.cell(row=row, column=12)),
            "bt_flag": _safe_value(ws.cell(row=row, column=14)),
            "foreclosure_flag": _safe_value(ws.cell(row=row, column=16)),
            "duplicate_flag": _safe_value(ws.cell(row=row, column=17)),
        }
        existing_loans.append(loan)
        # Track yellow cells (rows 69-70 are manual entry rows)
        for col in range(2, 18):
            _track_editable(editable_fields, ws, "Bureau", row, col,
                            f"existing_loan_r{row}_c{col}")

    return {
        "scores": scores,
        "existing_loans": existing_loans,
        "commercial_bureau": commercial_bureau,
    }


def _parse_banking(wb, editable_fields: list) -> dict:
    ws = _get_sheet(wb, "Banking")
    if ws is None:
        return {}

    result = {"auto_pull": [], "manual_pull": []}
    current_section = "auto_pull"

    for row in range(1, 290):
        b_val = _safe_str(_safe_value(ws.cell(row=row, column=2)))
        if b_val and "manual" in b_val.lower() and "pull" in b_val.lower():
            current_section = "manual_pull"
            continue

        # Collect row data
        row_data = {}
        has_data = False
        for col in range(2, 39):
            val = _safe_value(ws.cell(row=row, column=col))
            if val is not None:
                row_data[f"col_{get_column_letter(col)}"] = val
                has_data = True
            _track_editable(editable_fields, ws, "Banking", row, col)

        if has_data and row_data:
            result[current_section].append({"row": row, **row_data})

    return result


def _parse_gst(wb, editable_fields: list) -> dict:
    ws = _get_sheet(wb, "GST")
    if ws is None:
        return {"auto_pull": {}, "manual_pull": {}, "monthly_filings": []}

    # Auto pull: cols B-D
    auto_pull = {}
    for row in range(2, 71):
        key = _safe_str(_safe_value(ws.cell(row=row, column=2)))
        val = _safe_value(ws.cell(row=row, column=3))
        if key:
            auto_pull[key] = val

    # Manual pull: cols H-J
    manual_pull = {}
    for row in range(2, 71):
        key = _safe_str(_safe_value(ws.cell(row=row, column=8)))
        val = _safe_value(ws.cell(row=row, column=9))
        if key:
            manual_pull[key] = val
            _track_editable(editable_fields, ws, "GST", row, 9, key)

    # Monthly filings
    monthly_filings = []
    for row in range(2, 71):
        month = _safe_value(ws.cell(row=row, column=4))
        if month is None:
            continue
        entry = {
            "month": month,
            "fy": _safe_value(ws.cell(row=row, column=5)),
            "amount": _safe_value(ws.cell(row=row, column=6)),
        }
        monthly_filings.append(entry)
        # Manual pull monthly filings
        m_month = _safe_value(ws.cell(row=row, column=10))
        if m_month is not None:
            monthly_filings.append({
                "month": m_month,
                "fy": _safe_value(ws.cell(row=row, column=11)),
                "amount": _safe_value(ws.cell(row=row, column=12)) if ws.cell(row=row, column=12).value else None,
                "source": "manual",
            })
            for c in [10, 11, 12]:
                _track_editable(editable_fields, ws, "GST", row, c, f"manual_filing_r{row}")

    return {
        "auto_pull": auto_pull,
        "manual_pull": manual_pull,
        "monthly_filings": monthly_filings,
    }


def _parse_company_financials(wb, editable_fields: list) -> dict:
    ws = _get_sheet(wb, "Company Financials")
    if ws is None:
        return {}

    result = {}
    for row in range(1, 42):
        label = _safe_str(_safe_value(ws.cell(row=row, column=2)))
        if not label:
            continue
        entry = {}
        for col in range(3, 7):
            header = _safe_str(_safe_value(ws.cell(row=1, column=col))) or f"col_{col}"
            entry[header] = _safe_value(ws.cell(row=row, column=col))
            _track_editable(editable_fields, ws, "Company Financials", row, col, label)
        result[label] = entry
    return result


def _parse_aip(wb, editable_fields: list) -> dict:
    ws = _get_sheet(wb, "AIP")
    if ws is None:
        return {"primary_income": {}, "bills": [], "secondary_income": []}

    primary_income = {}
    for row in range(2, 20):
        label = _safe_str(_safe_value(ws.cell(row=row, column=2)))
        if label:
            primary_income[label] = _safe_value(ws.cell(row=row, column=3))
            _track_editable(editable_fields, ws, "AIP", row, 3, label)

    # Kaccha pakka bills (cols J-O)
    bills = []
    for row in range(2, 37):
        bill_type = _safe_value(ws.cell(row=row, column=10))
        if bill_type is None:
            continue
        bill = {"type": bill_type}
        for col in range(11, 16):
            header = _safe_str(_safe_value(ws.cell(row=1, column=col))) or f"col_{col}"
            bill[header] = _safe_value(ws.cell(row=row, column=col))
            _track_editable(editable_fields, ws, "AIP", row, col, f"bill_r{row}")
        bills.append(bill)

    # Secondary income
    secondary_income = []
    for row in range(20, 37):
        label = _safe_str(_safe_value(ws.cell(row=row, column=2)))
        val = _safe_value(ws.cell(row=row, column=3))
        if label and val is not None:
            secondary_income.append({"label": label, "value": val})

    return {
        "primary_income": primary_income,
        "bills": bills,
        "secondary_income": secondary_income,
    }


def _parse_pd_notes(wb, editable_fields: list) -> dict:
    ws = _get_sheet(wb, "PD notes")
    if ws is None:
        return {}

    result = {}
    current_section = None

    for row in range(1, 95):
        # Col A has labels for structured fields, col D has editable values
        col_a = _safe_str(_safe_value(ws.cell(row=row, column=1)))
        col_d = _safe_value(ws.cell(row=row, column=4))

        # Detect section headers (e.g. "Notes on Borrower Profile")
        if col_a and "notes on" in col_a.lower():
            current_section = col_a
            continue

        # Free-text note lines (in col A, spanning the row) — belong to current_section
        if current_section and col_a and col_d is None:
            if current_section not in result:
                result[current_section] = col_a
            else:
                result[current_section] += "\n" + col_a
            _track_editable(editable_fields, ws, "PD notes", row, 1, current_section)
            continue

        # Structured fields: col A = label, col D = value
        if col_a and col_d is not None:
            result[col_a] = col_d
            _track_editable(editable_fields, ws, "PD notes", row, 4, col_a)

    return result


def _parse_stock_details(wb, editable_fields: list) -> list:
    ws = _get_sheet(wb, "Stock Details")
    if ws is None:
        return []

    items = []
    for row in range(3, 24):
        sl_no = _safe_value(ws.cell(row=row, column=1))
        desc = _safe_value(ws.cell(row=row, column=2))
        if sl_no is None and desc is None:
            continue
        item = {
            "sl_no": sl_no,
            "description": desc,
            "quantity": _safe_value(ws.cell(row=row, column=3)),
            "rate": _safe_value(ws.cell(row=row, column=4)),
            "amount": _safe_value(ws.cell(row=row, column=5)),
        }
        items.append(item)
        for col in range(1, 6):
            _track_editable(editable_fields, ws, "Stock Details", row, col,
                            f"stock_r{row}")
    return items


def _parse_scorecard(wb, editable_fields: list) -> dict:
    ws = _get_sheet(wb, "Scorecard")
    if ws is None:
        return {"total_score": None, "risk_band": None, "parameters": []}

    total_score = None
    risk_band = None
    parameters = []

    for row in range(1, 47):
        b_val = _safe_str(_safe_value(ws.cell(row=row, column=2)))
        c_val = _safe_str(_safe_value(ws.cell(row=row, column=3)))
        d_val = _safe_value(ws.cell(row=row, column=4))
        if b_val and "total score" in b_val.lower():
            total_score = _safe_int(d_val)
        if b_val and ("scoring quality" in b_val.lower() or "risk band" in b_val.lower()):
            risk_band = _safe_str(d_val) or risk_band

        # Parameters: B=sr_no, C=parameter, F=max_score, G=criteria, H=score
        param_name = _safe_str(_safe_value(ws.cell(row=row, column=3)))
        max_score = _safe_value(ws.cell(row=row, column=6))
        criteria = _safe_value(ws.cell(row=row, column=7))
        marks = _safe_value(ws.cell(row=row, column=8))
        if param_name and marks is not None and row >= 8:
            param = {
                "sr_no": b_val,
                "parameter": param_name,
                "max_score": max_score,
                "criteria": criteria,
                "score": marks,
            }
            parameters.append(param)
            _track_editable(editable_fields, ws, "Scorecard", row, 7,
                            f"scorecard_criteria_{param_name}")
            _track_editable(editable_fields, ws, "Scorecard", row, 8,
                            f"scorecard_score_{param_name}")

    return {
        "total_score": total_score,
        "risk_band": risk_band,
        "parameters": parameters,
    }


def _parse_deviations(wb, editable_fields: list) -> list:
    ws = _get_sheet(wb, "Deviations_Credit")
    if ws is None:
        return []

    deviations = []
    for row in range(2, 44):
        dev = _safe_value(ws.cell(row=row, column=2))
        if dev is None:
            continue
        entry = {
            "deviation": dev,
            "description": _safe_value(ws.cell(row=row, column=3)),
            "mitigants": _safe_value(ws.cell(row=row, column=4)),
            "approving_authority": _safe_value(ws.cell(row=row, column=5)),
            "approval_status": _safe_value(ws.cell(row=row, column=6)),
            "approved_by": _safe_value(ws.cell(row=row, column=7)),
            "date": _safe_value(ws.cell(row=row, column=8)),
        }
        deviations.append(entry)
        for col in range(2, 14):
            _track_editable(editable_fields, ws, "Deviations_Credit", row, col,
                            f"deviation_r{row}")
    return deviations


def _parse_interest_rate(wb, editable_fields: list) -> dict:
    ws = _get_sheet(wb, "Interest Rate Calculator")
    if ws is None:
        return {}

    result = {}
    fields = [
        (2, "security_type"),
        (3, "loan_amount_band"),
        (4, "geography"),
        (5, "bureau_score_band"),
        (6, "credit_assessment_program"),
        (7, "num_credit_deviations"),
        (8, "final_rate"),
    ]
    for row, key in fields:
        val = _safe_value(ws.cell(row=row, column=3))
        result[key] = val
        _track_editable(editable_fields, ws, "Interest Rate Calculator", row, 3, key)
    return result


def _parse_eligibility(wb, editable_fields: list) -> dict:
    result = {}
    for sheet_name in ["Eligibility_Inventory", "Eligibility_P&M", "Eligibility_Property",
                       "Eligibility Inventory", "Eligibility P&M", "Eligibility Property"]:
        ws = _get_sheet(wb, sheet_name)
        if ws is None:
            continue
        key = sheet_name.lower().replace(" ", "_").replace("eligibility_", "").replace("&", "and")
        data = {}
        for row in range(1, 50):
            label = _safe_str(_safe_value(ws.cell(row=row, column=2)))
            val = _safe_value(ws.cell(row=row, column=3))
            if label:
                data[label] = val
                _track_editable(editable_fields, ws, sheet_name, row, 3, label)
        if data:
            result[key] = data
    return result


def _parse_kv_sheet(wb, sheet_name: str, max_rows: int, editable_fields: list) -> list:
    """Parse a sheet with label-value or tabular data into a list of dicts."""
    ws = _get_sheet(wb, sheet_name)
    if ws is None:
        return []

    items = []
    for row in range(2, max_rows + 1):
        row_data = {}
        has_data = False
        for col in range(2, 15):
            val = _safe_value(ws.cell(row=row, column=col))
            if val is not None:
                header = _safe_str(_safe_value(ws.cell(row=1, column=col))) or f"col_{col}"
                row_data[header] = val
                has_data = True
                _track_editable(editable_fields, ws, sheet_name, row, col)
        if has_data:
            items.append(row_data)
    return items


def _parse_loan_final(wb, editable_fields: list) -> dict:
    ws = _get_sheet(wb, "Logic_Loan_Final_Values")
    if ws is None:
        return {}

    # Col A = label, Col B = value, Col C = description
    field_map = {2: "amount", 3: "tenure", 4: "interest_rate", 5: "emi"}
    result = {}
    for row, field_name in field_map.items():
        val = _safe_value(ws.cell(row=row, column=2))
        try:
            result[field_name] = float(val) if val is not None else None
        except (ValueError, TypeError):
            result[field_name] = val
    return result


def _parse_risk_band(wb, editable_fields: list) -> dict:
    ws = _get_sheet(wb, "INPUT_Risk_Band")
    if ws is None:
        return {}

    result = {}
    for row in range(1, 8):
        key = _safe_str(_safe_value(ws.cell(row=row, column=1)))
        val = _safe_value(ws.cell(row=row, column=2))
        if key:
            result[key] = val
    return result


def _parse_tradeline_summary(wb, editable_fields: list) -> list:
    ws = _get_sheet(wb, "Tradeline_Summary")
    if ws is None:
        return []

    headers = []
    for col in range(1, 17):
        h = _safe_str(_safe_value(ws.cell(row=1, column=col)))
        headers.append(h or f"col_{col}")

    items = []
    for row in range(2, 28):
        row_data = {}
        has_data = False
        for col in range(1, 17):
            val = _safe_value(ws.cell(row=row, column=col))
            if val is not None:
                row_data[headers[col - 1]] = val
                has_data = True
        if has_data:
            items.append(row_data)
    return items


def _parse_applicant_summary(wb, editable_fields: list) -> list:
    ws = _get_sheet(wb, "Applicant_Summary")
    if ws is None:
        return []

    headers = []
    for col in range(1, 15):
        h = _safe_str(_safe_value(ws.cell(row=1, column=col)))
        headers.append(h or f"col_{col}")

    items = []
    for row in range(2, 5):
        row_data = {}
        has_data = False
        for col in range(1, 15):
            val = _safe_value(ws.cell(row=row, column=col))
            if val is not None:
                row_data[headers[col - 1]] = val
                has_data = True
        if has_data:
            items.append(row_data)
    return items


def parse_cam_xlsm(content: bytes, filename: str) -> dict:
    """
    Parse a .xlsm CAM Excel file and extract structured data from all sheets.

    Args:
        content: Raw bytes of the .xlsm file.
        filename: Original filename (for logging).

    Returns:
        dict with structured data from all sheets plus editable field tracking.
    """
    logger.info("Parsing CAM XLSM file: %s (%d bytes)", filename, len(content))

    # Load workbook: data_only=True for computed values, keep_vba=True for .xlsm
    # Note: We load twice — once with data_only for values, once without for colors.
    # openpyxl with data_only=True loses style info in some versions, so we use
    # the non-data_only workbook for color detection.
    try:
        wb_data = openpyxl.load_workbook(
            io.BytesIO(content), data_only=True, keep_vba=True, read_only=False
        )
    except Exception as e:
        logger.error("Failed to load workbook (data_only): %s", e)
        raise ValueError(f"Failed to parse XLSM file '{filename}': {e}") from e

    try:
        wb_style = openpyxl.load_workbook(
            io.BytesIO(content), data_only=False, keep_vba=True, read_only=False
        )
    except Exception:
        logger.warning("Could not load style workbook; editable field detection may be limited")
        wb_style = wb_data

    logger.info("Sheets found: %s", wb_data.sheetnames)

    editable_fields: list[dict] = []

    # For color detection, we use wb_style. For values, wb_data.
    # We'll pass wb_style to the editable tracker and wb_data to value extractors.
    # To keep things simpler, we use wb_style for parsing (which has formulas not values)
    # only for color, and wb_data for actual value extraction.

    # Build result
    result = {
        "application": _parse_processed_data_basic(wb_data, editable_fields),
        "output": _parse_output(wb_data, editable_fields),
        "demographic": _parse_demographic(wb_data, editable_fields),
        "bureau": _parse_bureau(wb_data, editable_fields),
        "banking": _parse_banking(wb_data, editable_fields),
        "gst": _parse_gst(wb_data, editable_fields),
        "financials": _parse_company_financials(wb_data, editable_fields),
        "aip": _parse_aip(wb_data, editable_fields),
        "pd_notes": _parse_pd_notes(wb_data, editable_fields),
        "stock_details": _parse_stock_details(wb_data, editable_fields),
        "scorecard": _parse_scorecard(wb_data, editable_fields),
        "deviations": _parse_deviations(wb_data, editable_fields),
        "interest_rate": _parse_interest_rate(wb_data, editable_fields),
        "eligibility": _parse_eligibility(wb_data, editable_fields),
        "loan_final": _parse_loan_final(wb_data, editable_fields),
        "sanction_conditions": _parse_kv_sheet(wb_data, "Sanction Conditions", 20, editable_fields),
        "loan_purpose": _parse_kv_sheet(wb_data, "Loan Purpose", 20, editable_fields),
        "reference_checks": _parse_kv_sheet(wb_data, "Reference Checks", 20, editable_fields),
        "risk_band": _parse_risk_band(wb_data, editable_fields),
        "tradeline_summary": _parse_tradeline_summary(wb_data, editable_fields),
        "applicant_summary": _parse_applicant_summary(wb_data, editable_fields),
    }

    # Now re-scan editable fields using the style workbook for accurate color detection
    editable_fields_final: list[dict] = []
    for ef in editable_fields:
        sheet_name = ef["sheet"]
        cell_ref = ef["cell"]
        ws_style = _get_sheet(wb_style, sheet_name)
        if ws_style is None:
            continue
        try:
            cell = ws_style[cell_ref]
            if _is_yellow(cell):
                editable_fields_final.append(ef)
        except Exception:
            pass

    result["editable_fields"] = editable_fields_final

    # Cleanup
    try:
        wb_data.close()
        if wb_style is not wb_data:
            wb_style.close()
    except Exception:
        pass

    logger.info(
        "Parsed %s: %d output keys, %d bureau scores, %d existing loans, "
        "%d editable fields, %d tradelines, %d applicants",
        filename,
        len(result.get("output", {})),
        len(result.get("bureau", {}).get("scores", [])),
        len(result.get("bureau", {}).get("existing_loans", [])),
        len(editable_fields_final),
        len(result.get("tradeline_summary", [])),
        len(result.get("applicant_summary", [])),
    )

    return result
