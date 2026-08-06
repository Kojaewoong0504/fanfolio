from typing import Annotated

from fastapi import Cookie, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.errors import AppError
from app.models import Role, Session, User

DbSession = Annotated[AsyncSession, Depends(get_session)]


async def current_user(
    session: DbSession, fanfolio_session: str | None = Cookie(default=None)
) -> User:
    if not fanfolio_session:
        raise AppError(401, "AUTH_REQUIRED", "로그인이 필요합니다.")
    user = await session.scalar(
        select(User)
        .join(Session, Session.user_id == User.id)
        .where(Session.token == fanfolio_session)
    )
    if not user:
        raise AppError(401, "AUTH_REQUIRED", "유효하지 않은 세션입니다.")
    return user


async def require(role: Role, user: Annotated[User, Depends(current_user)]) -> User:
    if user.role != role:
        raise AppError(403, "FORBIDDEN", "권한이 없습니다.")
    return user


async def fan_user(user: Annotated[User, Depends(current_user)]) -> User:
    return await require(Role.FAN, user)


async def admin_user(user: Annotated[User, Depends(current_user)]) -> User:
    return await require(Role.ADMIN, user)


async def artist_user(user: Annotated[User, Depends(current_user)]) -> User:
    return await require(Role.ARTIST, user)


FanUser = Annotated[User, Depends(fan_user)]
AdminUser = Annotated[User, Depends(admin_user)]
ArtistUser = Annotated[User, Depends(artist_user)]
CurrentUser = Annotated[User, Depends(current_user)]
