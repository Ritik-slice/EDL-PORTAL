import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, JSON, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.db.base import Base


class RecommendationType(str, enum.Enum):
    approve = "approve"
    decline = "decline"
    refer = "refer"  # refer to credit committee with conditions


class CAMReport(Base):
    __tablename__ = "cam_reports"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id: Mapped[str] = mapped_column(String, ForeignKey("cases.id"), nullable=False)
    version: Mapped[int] = mapped_column(default=1)

    # Generated sections — stored as structured JSON for UI rendering
    executive_summary: Mapped[str] = mapped_column(Text, nullable=True)
    borrower_profile: Mapped[dict] = mapped_column(JSON, nullable=True)
    financial_analysis: Mapped[dict] = mapped_column(JSON, nullable=True)
    banking_behaviour: Mapped[dict] = mapped_column(JSON, nullable=True)
    gst_compliance: Mapped[dict] = mapped_column(JSON, nullable=True)
    bureau_summary: Mapped[dict] = mapped_column(JSON, nullable=True)
    risk_flags: Mapped[list] = mapped_column(JSON, nullable=True)
    proposed_structure: Mapped[dict] = mapped_column(JSON, nullable=True)
    recommendation: Mapped[RecommendationType] = mapped_column(SAEnum(RecommendationType), nullable=True)
    recommendation_rationale: Mapped[str] = mapped_column(Text, nullable=True)

    # Rendered output
    pdf_s3_key: Mapped[str] = mapped_column(String(1000), nullable=True)
    docx_s3_key: Mapped[str] = mapped_column(String(1000), nullable=True)

    # Review trail
    reviewed_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewer_notes: Mapped[str] = mapped_column(Text, nullable=True)

    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    case: Mapped["Case"] = relationship("Case", back_populates="cam_reports")  # noqa: F821
