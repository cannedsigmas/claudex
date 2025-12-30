from __future__ import annotations

from datetime import date, datetime, timezone
from typing import TYPE_CHECKING, cast
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.constants import REDIS_KEY_USER_SETTINGS
from app.core.config import get_settings
from app.models.db_models import Chat, Message, MessageRole, User, UserSettings
from app.models.schemas import UserSettingsResponse
from app.models.types import InstalledPluginDict, JSONValue
from app.services.base import BaseDbService, SessionFactoryType
from app.services.exceptions import UserException
from app.utils.redis import redis_connection

if TYPE_CHECKING:
    from redis.asyncio import Redis

settings = get_settings()


class UserService(BaseDbService[UserSettings]):
    def __init__(self, session_factory: SessionFactoryType | None = None) -> None:
        super().__init__(session_factory)

    async def invalidate_settings_cache(self, redis: Redis[str], user_id: UUID) -> None:
        cache_key = REDIS_KEY_USER_SETTINGS.format(user_id=user_id)
        await redis.delete(cache_key)

    async def get_user_settings(
        self,
        user_id: UUID,
        db: AsyncSession | None = None,
        for_update: bool = False,
        redis: Redis[str] | None = None,
    ) -> UserSettings | UserSettingsResponse:
        cache_key = REDIS_KEY_USER_SETTINGS.format(user_id=user_id)

        if redis and not for_update:
            cached = await redis.get(cache_key)
            if cached:
                response = UserSettingsResponse.model_validate_json(cached)
                return cast(UserSettingsResponse, response)

        stmt = select(UserSettings).where(UserSettings.user_id == user_id)
        if for_update:
            stmt = stmt.with_for_update()

        if db is None:
            async with self.session_factory() as session:
                result = await session.execute(stmt)
                user_settings = result.scalar_one_or_none()
        else:
            result = await db.execute(stmt)
            user_settings = result.scalar_one_or_none()

        if not user_settings:
            raise UserException("User settings not found")

        if redis and not for_update:
            response = UserSettingsResponse.model_validate(user_settings)
            await redis.setex(
                cache_key,
                settings.USER_SETTINGS_CACHE_TTL_SECONDS,
                response.model_dump_json(),
            )

        return cast(UserSettings, user_settings)

    async def update_user_settings(
        self, user_id: UUID, settings_update: dict[str, JSONValue], db: AsyncSession
    ) -> UserSettings:
        user_settings = await db.scalar(
            select(UserSettings)
            .where(UserSettings.user_id == user_id)
            .with_for_update()
        )
        if not user_settings:
            raise UserException("User settings not found")

        json_fields = {
            "custom_agents",
            "custom_mcps",
            "custom_env_vars",
            "custom_skills",
            "custom_slash_commands",
            "custom_prompts",
        }

        for field, value in settings_update.items():
            setattr(user_settings, field, value)
            if field in json_fields:
                flag_modified(user_settings, field)

        await db.commit()
        await db.refresh(user_settings)

        return cast(UserSettings, user_settings)

    async def commit_settings_and_invalidate_cache(
        self, user_settings: UserSettings, db: AsyncSession, user_id: UUID
    ) -> None:
        await db.commit()
        await db.refresh(user_settings)
        async with redis_connection() as redis:
            await self.invalidate_settings_cache(redis, user_id)

    def remove_installed_component(
        self, user_settings: UserSettings, component_id: str
    ) -> bool:
        if not user_settings.installed_plugins:
            return False

        modified = False
        updated_plugins: list[InstalledPluginDict] = []

        for plugin in user_settings.installed_plugins:
            components = list(plugin.get("components", []))
            if component_id in components:
                components = [c for c in components if c != component_id]
                modified = True
            if components:
                plugin["components"] = components
                updated_plugins.append(plugin)
            else:
                modified = True

        if modified:
            user_settings.installed_plugins = updated_plugins
        return modified

    async def get_user_daily_message_count(self, user_id: UUID) -> int:
        today = date.today()
        start_of_day = datetime.combine(today, datetime.min.time()).replace(
            tzinfo=timezone.utc
        )
        end_of_day = datetime.combine(today, datetime.max.time()).replace(
            tzinfo=timezone.utc
        )

        async with self.session_factory() as db:
            query = select(func.count(Message.id)).filter(
                Message.role == MessageRole.USER,
                Message.created_at >= start_of_day,
                Message.created_at <= end_of_day,
                Message.chat_id.in_(select(Chat.id).filter(Chat.user_id == user_id)),
            )
            result = await db.execute(query)
            return result.scalar() or 0

    async def get_remaining_messages(self, user_id: UUID) -> int:
        async with self.session_factory() as db:
            user_result = await db.execute(
                select(User.daily_message_limit).where(User.id == user_id)
            )
            daily_limit = user_result.scalar_one_or_none()
            if daily_limit is None:
                return -1

            if daily_limit <= 0:
                return 0

            used_messages = await self.get_user_daily_message_count(user_id)
            remaining = max(0, daily_limit - used_messages)
            return cast(int, remaining)

    async def check_message_limit(self, user_id: UUID) -> bool:
        remaining = await self.get_remaining_messages(user_id)
        return remaining == -1 or remaining > 0
