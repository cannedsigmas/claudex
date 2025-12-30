import re

from typing import cast

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.deps import get_db, get_user_service
from app.core.security import get_current_user
from app.models.db_models import User
from app.models.schemas import (
    McpCreateRequest,
    McpDeleteResponse,
    McpResponse,
    McpUpdateRequest,
)
from app.models.types import CustomMcpDict
from app.services.exceptions import UserException
from app.services.user import UserService

router = APIRouter()

SAFE_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_\-\.]+$")
MAX_MCPS_PER_USER = 20


@router.post("/", response_model=McpResponse, status_code=status.HTTP_201_CREATED)
async def create_mcp(
    request: McpCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    user_service: UserService = Depends(get_user_service),
) -> CustomMcpDict:
    if not SAFE_NAME_PATTERN.match(request.name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid MCP name format",
        )

    try:
        user_settings = await user_service.get_user_settings(
            current_user.id, db=db, for_update=True
        )
    except UserException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    current_mcps: list[CustomMcpDict] = cast(
        list[CustomMcpDict], user_settings.custom_mcps or []
    )

    if len(current_mcps) >= MAX_MCPS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_MCPS_PER_USER} MCPs per user",
        )

    if any(m.get("name") == request.name for m in current_mcps):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"MCP '{request.name}' already exists",
        )

    mcp_data: CustomMcpDict = {
        "name": request.name,
        "description": request.description,
        "command_type": request.command_type,
        "package": request.package,
        "url": request.url,
        "env_vars": request.env_vars,
        "args": request.args,
        "enabled": request.enabled,
    }

    current_mcps.append(mcp_data)
    user_settings.custom_mcps = current_mcps
    flag_modified(user_settings, "custom_mcps")

    await user_service.commit_settings_and_invalidate_cache(
        user_settings, db, current_user.id
    )

    return mcp_data


@router.put("/{mcp_name}", response_model=McpResponse)
async def update_mcp(
    mcp_name: str,
    request: McpUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    user_service: UserService = Depends(get_user_service),
) -> CustomMcpDict:
    if not SAFE_NAME_PATTERN.match(mcp_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid MCP name format",
        )

    try:
        user_settings = await user_service.get_user_settings(
            current_user.id, db=db, for_update=True
        )
    except UserException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    current_mcps: list[CustomMcpDict] = cast(
        list[CustomMcpDict], user_settings.custom_mcps or []
    )
    mcp_index = next(
        (i for i, m in enumerate(current_mcps) if m.get("name") == mcp_name),
        None,
    )

    if mcp_index is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"MCP '{mcp_name}' not found",
        )

    mcp = current_mcps[mcp_index]
    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        mcp[key] = value  # type: ignore[literal-required]

    user_settings.custom_mcps = current_mcps
    flag_modified(user_settings, "custom_mcps")

    await user_service.commit_settings_and_invalidate_cache(
        user_settings, db, current_user.id
    )

    return mcp


@router.delete("/{mcp_name}", response_model=McpDeleteResponse)
async def delete_mcp(
    mcp_name: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    user_service: UserService = Depends(get_user_service),
) -> McpDeleteResponse:
    if not SAFE_NAME_PATTERN.match(mcp_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid MCP name format",
        )

    try:
        user_settings = await user_service.get_user_settings(
            current_user.id, db=db, for_update=True
        )
    except UserException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    current_mcps = user_settings.custom_mcps or []
    mcp_index = next(
        (i for i, m in enumerate(current_mcps) if m.get("name") == mcp_name),
        None,
    )

    if mcp_index is None:
        return McpDeleteResponse(status="not_found")

    current_mcps.pop(mcp_index)
    user_settings.custom_mcps = current_mcps
    flag_modified(user_settings, "custom_mcps")

    if user_service.remove_installed_component(user_settings, f"mcp:{mcp_name}"):
        flag_modified(user_settings, "installed_plugins")

    await user_service.commit_settings_and_invalidate_cache(
        user_settings, db, current_user.id
    )

    return McpDeleteResponse(status="deleted")
