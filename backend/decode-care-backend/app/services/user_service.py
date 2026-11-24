"""User service — registration, login, profile."""

import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException, status

from app.database import get_db
from app.models.user import UserInDB, UserOut, UserRegister
from app.utils.security import hash_password, verify_password, create_access_token

logger = logging.getLogger(__name__)


def _doc_to_out(doc: dict) -> UserOut:
    return UserOut(
        id         = str(doc["_id"]),
        name       = doc["name"],
        email      = doc["email"],
        age        = doc.get("age"),
        gender     = doc.get("gender"),
        created_at = doc["created_at"],
    )


async def register_user(data: UserRegister) -> tuple[str, UserOut]:
    """Create a new user. Returns (access_token, UserOut)."""
    db = get_db()

    # Check duplicate
    if await db.users.find_one({"email": data.email}):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    now = datetime.now(timezone.utc)
    doc = {
        "name":            data.name,
        "email":           data.email,
        "hashed_password": hash_password(data.password),
        "age":             data.age,
        "gender":          data.gender,
        "created_at":      now,
    }
    result  = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id

    user_out = _doc_to_out(doc)
    token    = create_access_token({"sub": str(result.inserted_id)})
    return token, user_out


async def login_user(email: str, password: str) -> tuple[str, UserOut]:
    """Authenticate user. Returns (access_token, UserOut)."""
    db  = get_db()
    doc = await db.users.find_one({"email": email})

    if not doc or not verify_password(password, doc["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    user_out = _doc_to_out(doc)
    token    = create_access_token({"sub": str(doc["_id"])})
    return token, user_out


async def get_user_by_id(user_id: str) -> Optional[UserOut]:
    db  = get_db()
    try:
        oid = ObjectId(user_id)
    except Exception:
        return None
    doc = await db.users.find_one({"_id": oid})
    if not doc:
        return None
    return _doc_to_out(doc)
