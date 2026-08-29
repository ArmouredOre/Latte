from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..crud import (
    create_sheet,
    delete_sheet,
    get_owned_sheet,
    list_sheets,
    update_sheet,
)
from ..database import get_db
from ..models import ListType, User
from ..schemas import SheetCreate, SheetOut, SheetUpdate

router = APIRouter(prefix="/api/sheets", tags=["sheets"])


@router.get("", response_model=list[SheetOut])
def list_my_sheets(
    list_type: Optional[ListType] = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return list_sheets(db, user, list_type)


@router.post("", response_model=SheetOut, status_code=status.HTTP_201_CREATED)
def create_my_sheet(
    body: SheetCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return create_sheet(
        db,
        user,
        body.name.strip() or f"Untitled {body.list_type.value}",
        body.list_type,
        body.rows,
    )


@router.get("/{sheet_id}", response_model=SheetOut)
def get_my_sheet(
    sheet_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return get_owned_sheet(db, sheet_id, user)


@router.put("/{sheet_id}", response_model=SheetOut)
def update_my_sheet(
    sheet_id: int,
    body: SheetUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.name is None and body.rows is None:
        from fastapi import HTTPException
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Nothing to update")
    sheet = get_owned_sheet(db, sheet_id, user)
    return update_sheet(db, sheet, name=body.name, rows=body.rows)


@router.delete("/{sheet_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_sheet(
    sheet_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sheet = get_owned_sheet(db, sheet_id, user)
    delete_sheet(db, sheet)
