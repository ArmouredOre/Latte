from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ListType, Sheet, User


def upsert_google_user(db: Session, info: dict) -> User:
    user = db.get(User, info["sub"])
    if user is None:
        user = User(id=info["sub"], email=info["email"], name=info.get("name", ""), picture=info.get("picture"))
        db.add(user)
    else:
        user.email = info["email"]
        user.name = info.get("name", user.name)
        user.picture = info.get("picture", user.picture)
    db.commit()
    db.refresh(user)
    return user


def list_sheets(db: Session, owner: User, list_type: Optional[ListType] = None) -> list[Sheet]:
    stmt = select(Sheet).where(Sheet.owner_id == owner.id)
    if list_type is not None:
        stmt = stmt.where(Sheet.list_type == list_type)
    stmt = stmt.order_by(Sheet.created_at, Sheet.id)
    return list(db.scalars(stmt))


def get_owned_sheet(db: Session, sheet_id: int, owner: User) -> Sheet:
    sheet = db.get(Sheet, sheet_id)
    if sheet is None or sheet.owner_id != owner.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Sheet not found")
    return sheet


def create_sheet(
    db: Session, owner: User, name: str, list_type: ListType, rows: Optional[list] = None
) -> Sheet:
    sheet = Sheet(owner_id=owner.id, name=name, list_type=list_type, rows=rows or [])
    db.add(sheet)
    db.commit()
    db.refresh(sheet)
    return sheet


def update_sheet(
    db: Session,
    sheet: Sheet,
    name: Optional[str] = None,
    rows: Optional[list] = None,
) -> Sheet:
    if name is not None:
        sheet.name = name.strip() or sheet.name
    if rows is not None:
        sheet.rows = rows
    db.commit()
    db.refresh(sheet)
    return sheet


def delete_sheet(db: Session, sheet: Sheet) -> None:
    db.delete(sheet)
    db.commit()
