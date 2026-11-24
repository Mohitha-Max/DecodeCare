from fastapi import APIRouter, Depends
from app.models.user import UserLogin, UserRegister, TokenResponse, UserOut
from app.services.user_service import register_user, login_user, get_user_by_id
from app.utils.security import get_current_user_id

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(data: UserRegister):
    """Create a new account and return JWT + user info."""
    token, user = await register_user(data)
    return TokenResponse(access_token=token, user=user)


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin):
    """Authenticate and return JWT + user info."""
    token, user = await login_user(data.email, data.password)
    return TokenResponse(access_token=token, user=user)


@router.get("/me", response_model=UserOut)
async def me(user_id: str = Depends(get_current_user_id)):
    """Return the currently authenticated user's profile."""
    user = await get_user_by_id(user_id)
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    return user
