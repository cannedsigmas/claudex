from collections.abc import AsyncIterator
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import get_current_user
from app.db.session import SessionLocal, get_db
from app.models.db_models import Chat, User
from app.services.agent import AgentService
from app.services.ai_model import AIModelService
from app.services.chat import ChatService
from app.services.claude_agent import ClaudeAgentService
from app.services.command import CommandService
from app.services.exceptions import UserException
from app.services.message import MessageService
from app.services.refresh_token import RefreshTokenService
from app.services.sandbox import SandboxService
from app.services.sandbox_providers import (
    SandboxProviderType,
    create_sandbox_provider,
)
from app.services.scheduler import SchedulerService
from app.services.marketplace import MarketplaceService
from app.services.plugin_installer import PluginInstallerService
from app.services.skill import SkillService
from app.services.storage import StorageService
from app.services.user import UserService

settings = get_settings()


def get_ai_model_service() -> AIModelService:
    return AIModelService(session_factory=SessionLocal)


def get_message_service() -> MessageService:
    return MessageService(session_factory=SessionLocal)


def get_user_service() -> UserService:
    return UserService(session_factory=SessionLocal)


def get_refresh_token_service() -> RefreshTokenService:
    return RefreshTokenService(session_factory=SessionLocal)


def get_skill_service() -> SkillService:
    return SkillService()


def get_command_service() -> CommandService:
    return CommandService()


def get_agent_service() -> AgentService:
    return AgentService()


def get_marketplace_service() -> MarketplaceService:
    return MarketplaceService()


def get_plugin_installer_service() -> PluginInstallerService:
    return PluginInstallerService()


def get_scheduler_service() -> SchedulerService:
    return SchedulerService(session_factory=SessionLocal)


async def get_sandbox_service(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    user_service: UserService = Depends(get_user_service),
) -> AsyncIterator[SandboxService]:
    try:
        user_settings = await user_service.get_user_settings(current_user.id, db=db)
        api_key = user_settings.e2b_api_key
        provider_type_str = user_settings.sandbox_provider
    except UserException:
        api_key = None
        provider_type_str = "docker"

    provider = create_sandbox_provider(provider_type_str, api_key)
    try:
        yield SandboxService(provider)
    finally:
        await provider.cleanup()


async def get_storage_service(
    sandbox_service: SandboxService = Depends(get_sandbox_service),
) -> StorageService:
    return StorageService(sandbox_service)


@dataclass
class SandboxContext:
    sandbox_id: str
    sandbox_provider: str | None


async def get_sandbox_context(
    sandbox_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SandboxContext:
    query = select(Chat.sandbox_id, Chat.sandbox_provider).where(
        Chat.sandbox_id == sandbox_id,
        Chat.user_id == current_user.id,
        Chat.deleted_at.is_(None),
    )
    result = await db.execute(query)
    row = result.one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Sandbox not found"
        )

    return SandboxContext(
        sandbox_id=row.sandbox_id,
        sandbox_provider=row.sandbox_provider,
    )


async def get_sandbox_service_for_context(
    context: SandboxContext = Depends(get_sandbox_context),
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service),
    db: AsyncSession = Depends(get_db),
) -> AsyncIterator[SandboxService]:
    try:
        user_settings = await user_service.get_user_settings(current_user.id, db=db)
        default_provider = user_settings.sandbox_provider
        api_key = user_settings.e2b_api_key
    except UserException:
        default_provider = "docker"
        api_key = None

    provider_type = context.sandbox_provider or default_provider
    if provider_type != SandboxProviderType.E2B.value:
        api_key = None

    provider = create_sandbox_provider(provider_type, api_key=api_key)
    try:
        yield SandboxService(provider)
    finally:
        await provider.cleanup()


async def get_chat_service(
    file_service: StorageService = Depends(get_storage_service),
    sandbox_service: SandboxService = Depends(get_sandbox_service),
    user_service: UserService = Depends(get_user_service),
) -> AsyncIterator[ChatService]:
    async with ClaudeAgentService(session_factory=SessionLocal) as ai_service:
        yield ChatService(
            file_service,
            sandbox_service,
            ai_service,
            user_service,
            session_factory=SessionLocal,
        )


async def get_verified_sandbox_id(
    sandbox_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> str:
    sandbox_exists_query = select(
        exists().where(Chat.sandbox_id == sandbox_id, Chat.deleted_at.is_(None))
    )
    result = await db.execute(sandbox_exists_query)
    if not result.scalar():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sandbox not found",
        )

    has_access_query = select(
        exists().where(
            Chat.sandbox_id == sandbox_id,
            Chat.user_id == current_user.id,
            Chat.deleted_at.is_(None),
        )
    )
    result = await db.execute(has_access_query)
    if not result.scalar():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this sandbox",
        )

    return sandbox_id
