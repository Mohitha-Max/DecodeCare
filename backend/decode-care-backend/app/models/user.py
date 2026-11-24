from datetime import datetime
from pydantic import BaseModel, EmailStr, Field
from typing import Optional


# ── Request / Response models ─────────────────────────────────────────────────

class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6)
    age: Optional[int] = Field(None, ge=1, le=130)
    gender: Optional[str] = Field(None, pattern="^(male|female|other)$")


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    age: Optional[int] = None
    gender: Optional[str] = None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── DB document shape (not exposed via API) ───────────────────────────────────

class UserInDB(BaseModel):
    name: str
    email: str
    hashed_password: str
    age: Optional[int] = None
    gender: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
