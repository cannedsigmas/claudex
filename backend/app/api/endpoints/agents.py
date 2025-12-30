from typing import cast

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.deps import get_db, get_agent_service, get_user_service
from app.core.security import get_current_user
from app.models.db_models import User, UserSettings
from app.models.schemas import AgentDeleteResponse, AgentResponse, AgentUpdateRequest
from app.models.types import CustomAgentDict
from app.services.exceptions import AgentException, UserException
from app.services.agent import AgentService
from app.services.user import UserService

router = APIRouter()


@router.post(
    "/upload", response_model=AgentResponse, status_code=status.HTTP_201_CREATED
)
async def upload_agent(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    agent_service: AgentService = Depends(get_agent_service),
    user_service: UserService = Depends(get_user_service),
) -> CustomAgentDict:
    try:
        user_settings = cast(
            UserSettings,
            await user_service.get_user_settings(
                current_user.id, db=db, for_update=True
            ),
        )
    except UserException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    current_agents: list[CustomAgentDict] = user_settings.custom_agents or []

    try:
        agent_data = await agent_service.upload(
            str(current_user.id), file, current_agents
        )
    except AgentException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    current_agents.append(agent_data)
    user_settings.custom_agents = current_agents
    flag_modified(user_settings, "custom_agents")

    try:
        await user_service.commit_settings_and_invalidate_cache(
            user_settings, db, current_user.id
        )
    except Exception as e:
        await agent_service.delete(str(current_user.id), str(agent_data["name"]))
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save agent metadata",
        ) from e

    return agent_data


@router.put("/{agent_name}", response_model=AgentResponse)
async def update_agent(
    agent_name: str,
    request: AgentUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    agent_service: AgentService = Depends(get_agent_service),
    user_service: UserService = Depends(get_user_service),
) -> CustomAgentDict:
    try:
        sanitized_name = agent_service.sanitize_name(agent_name)
        if sanitized_name != agent_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid agent name format",
            )
    except AgentException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    try:
        user_settings = cast(
            UserSettings,
            await user_service.get_user_settings(
                current_user.id, db=db, for_update=True
            ),
        )
    except UserException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    current_agents: list[CustomAgentDict] = user_settings.custom_agents or []
    agent_index = next(
        (i for i, c in enumerate(current_agents) if c.get("name") == agent_name),
        None,
    )

    if agent_index is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{agent_name}' not found",
        )

    try:
        updated_agent = await agent_service.update(
            str(current_user.id), agent_name, request.content, current_agents
        )
    except AgentException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    current_agents[agent_index] = updated_agent
    user_settings.custom_agents = current_agents
    flag_modified(user_settings, "custom_agents")

    try:
        await user_service.commit_settings_and_invalidate_cache(
            user_settings, db, current_user.id
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update agent",
        ) from e

    return updated_agent


@router.delete("/{agent_name}", response_model=AgentDeleteResponse)
async def delete_agent(
    agent_name: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    agent_service: AgentService = Depends(get_agent_service),
    user_service: UserService = Depends(get_user_service),
) -> AgentDeleteResponse:
    try:
        sanitized_name = agent_service.sanitize_name(agent_name)
        if sanitized_name != agent_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid agent name format",
            )
    except AgentException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    try:
        user_settings = await user_service.get_user_settings(
            current_user.id, db=db, for_update=True
        )
    except UserException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    current_agents = user_settings.custom_agents or []
    agent_index = next(
        (i for i, c in enumerate(current_agents) if c.get("name") == agent_name),
        None,
    )

    if agent_index is None:
        return AgentDeleteResponse(status="not_found")

    await agent_service.delete(str(current_user.id), agent_name)

    current_agents.pop(agent_index)
    user_settings.custom_agents = current_agents
    flag_modified(user_settings, "custom_agents")

    if user_service.remove_installed_component(user_settings, f"agent:{agent_name}"):
        flag_modified(user_settings, "installed_plugins")

    await user_service.commit_settings_and_invalidate_cache(
        user_settings, db, current_user.id
    )

    return AgentDeleteResponse(status="deleted")
