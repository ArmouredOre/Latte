import enum
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class ListType(str, enum.Enum):
    todo = "todo"
    bucket = "bucket"
    timetable = "timetable"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # Google "sub"
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    picture: Mapped[Optional[str]] = mapped_column(String(2048), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sheets: Mapped[list["Sheet"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )


class Sheet(Base):
    __tablename__ = "sheets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    list_type: Mapped[ListType] = mapped_column(Enum(ListType))
    name: Mapped[str] = mapped_column(String(255))
    rows: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=utcnow
    )

    owner: Mapped[User] = relationship(back_populates="sheets")
