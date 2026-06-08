import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.db.base import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    underwriter = "underwriter"
    reviewer = "reviewer"
    viewer = "viewer"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), default=UserRole.underwriter)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    organisation_id: Mapped[str] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    cases: Mapped[list["Case"]] = relationship("Case", back_populates="created_by_user")  # noqa: F821
