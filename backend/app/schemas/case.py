from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class CaseCreate(BaseModel):
    borrower_name: str
    borrower_pan: Optional[str] = None
    borrower_gstin: Optional[str] = None
    borrower_entity_type: Optional[str] = None
    industry: Optional[str] = None
    loan_amount_requested: float
    loan_type: str = "term_loan"
    loan_purpose: Optional[str] = None
    loan_tenor_months: Optional[int] = None


class CaseOut(BaseModel):
    id: str
    case_ref: str
    borrower_name: str
    loan_amount_requested: float
    loan_type: Any
    status: Any
    risk_signals: Optional[dict] = None
    financial_summary: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CaseListItem(BaseModel):
    id: str
    case_ref: str
    borrower_name: str
    loan_amount_requested: float
    status: Any
    created_at: datetime

    model_config = {"from_attributes": True}
