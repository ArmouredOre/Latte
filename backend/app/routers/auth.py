from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import create_access_token, verify_google_credential
from ..crud import upsert_google_user
from ..database import get_db
from ..schemas import GoogleAuthRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/google", response_model=TokenResponse)
def auth_google(body: GoogleAuthRequest, db: Session = Depends(get_db)):
    info = verify_google_credential(body.credential)
    user = upsert_google_user(db, info)
    return TokenResponse(access_token=create_access_token(user.id), user=user)
