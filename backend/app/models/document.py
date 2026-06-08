import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Float, DateTime, JSON, ForeignKey, Boolean, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.db.base import Base


class DocumentType(str, enum.Enum):
    bank_statement = "bank_statement"
    gst_return = "gst_return"
    itr = "itr"
    financial_statement = "financial_statement"
    bureau_report = "bureau_report"
    form_26as = "form_26as"
    kyc = "kyc"
    other = "other"


class ParseStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id: Mapped[str] = mapped_column(String, ForeignKey("cases.id"), nullable=False)

    doc_type: Mapped[DocumentType] = mapped_column(SAEnum(DocumentType), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(nullable=True)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=True)

    parse_status: Mapped[ParseStatus] = mapped_column(SAEnum(ParseStatus), default=ParseStatus.pending)
    parse_error: Mapped[str] = mapped_column(String(2000), nullable=True)
    extracted_data: Mapped[dict] = mapped_column(JSON, nullable=True)
    extraction_confidence: Mapped[float] = mapped_column(Float, nullable=True)

    # Audit fields — every extracted field traces back here
    source_pages: Mapped[dict] = mapped_column(JSON, nullable=True)  # {"field_name": page_num}

    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    parsed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    case: Mapped["Case"] = relationship("Case", back_populates="documents")  # noqa: F821
