from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel

from .models import ListType


class GoogleAuthRequest(BaseModel):
    credential: str


class UserOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    email: str
    name: str
    picture: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class SheetCreate(BaseModel):
    name: str
    list_type: ListType
    rows: list[dict[str, Any]] = []


class SheetUpdate(BaseModel):
    name: Optional[str] = None
    rows: Optional[list[dict[str, Any]]] = None


class SheetOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    list_type: ListType
    name: str
    rows: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime
