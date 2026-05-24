from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional
from bson import ObjectId
import jwt
import os

from database import db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class JWTBearer(HTTPBearer):
    """HTTPBearer that returns 401 (not the default 403) when the
    Authorization header is missing or malformed. This is the semantically
    correct status — 401 means "you are not authenticated", 403 means
    "you are authenticated but lack permission". It also lets the frontend
    Axios interceptor treat a missing/expired token uniformly (always 401)
    and bounce the user back to /login. Before this, idle sessions where
    the token had been dropped from sessionStorage would return 403 from
    every dashboard fetch, which the interceptor ignored — resulting in
    silent empty tables instead of a redirect."""

    def __init__(self) -> None:
        super().__init__(auto_error=False)

    async def __call__(self, request: Request) -> HTTPAuthorizationCredentials:  # type: ignore[override]
        credentials = await super().__call__(request)
        if credentials is None or not credentials.credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        if credentials.scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid authentication scheme")
        return credentials


security = JWTBearer()
JWT_SECRET = os.environ.get('JWT_SECRET', 'bashari-secret-key-2024-secure')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=JWT_EXPIRATION_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(user: dict = Depends(get_current_user)):
    if user.get("role") not in ["super_admin", "branch_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_super_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return user
