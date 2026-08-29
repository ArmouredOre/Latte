from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from .models import ListType

MAX_NAME_LEN = 200
MAX_ROWS = 2000


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
    name: str = Field(max_length=MAX_NAME_LEN)
    list_type: ListType
    rows: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_ROWS)


class SheetUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=MAX_NAME_LEN)
    rows: Optional[list[dict[str, Any]]] = Field(default=None, max_length=MAX_ROWS)


class SheetOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    list_type: ListType
    name: str
    rows: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime
