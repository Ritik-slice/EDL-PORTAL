import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Float, DateTime, JSON, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.db.base import Base


class CaseStatus(str, enum.Enum):
    created = "created"
    documents_uploaded = "documents_uploaded"
    parsing = "parsing"
    parsed = "parsed"
    generating_cam = "generating_cam"
    cam_ready = "cam_ready"
    under_review = "under_review"
    approved = "approved"
    declined = "declined"


class LoanType(str, enum.Enum):
    term_loan = "term_loan"
    working_capital = "working_capital"
    overdraft = "overdraft"
    cc_limit = "cc_limit"


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    case_ref: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    borrower_name: Mapped[str] = mapped_column(String(255), nullable=False)
    borrower_pan: Mapped[str] = mapped_column(String(20), nullable=True)
    borrower_gstin: Mapped[str] = mapped_column(String(20), nullable=True)
    borrower_entity_type: Mapped[str] = mapped_column(String(50), nullable=True)  # pvt ltd, proprietorship, etc.
    industry: Mapped[str] = mapped_column(String(100), nullable=True)

    loan_amount_requested: Mapped[float] = mapped_column(Float, nullable=False)
    loan_type: Mapped[LoanType] = mapped_column(SAEnum(LoanType), default=LoanType.term_loan)
    loan_purpose: Mapped[str] = mapped_column(String(500), nullable=True)
    loan_tenor_months: Mapped[int] = mapped_column(nullable=True)

    status: Mapped[CaseStatus] = mapped_column(SAEnum(CaseStatus), default=CaseStatus.created)

    risk_signals: Mapped[dict] = mapped_column(JSON, nullable=True)
    financial_summary: Mapped[dict] = mapped_column(JSON, nullable=True)
    cross_validation_results: Mapped[dict] = mapped_column(JSON, nullable=True)

    created_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    organisation_id: Mapped[str] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    created_by_user: Mapped["User"] = relationship("User", back_populates="cases")  # noqa: F821
    documents: Mapped[list["Document"]] = relationship("Document", back_populates="case", cascade="all, delete-orphan")  # noqa: F821
    cam_reports: Mapped[list["CAMReport"]] = relationship("CAMReport", back_populates="case", cascade="all, delete-orphan")  # noqa: F821
