from typing import cast

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.deps import get_db, get_command_service, get_user_service
from app.core.security import get_current_user
from app.models.db_models import User, UserSettings
from app.models.schemas import (
    CommandDeleteResponse,
    CommandResponse,
    CommandUpdateRequest,
)
from app.models.types import CustomSlashCommandDict
from app.services.exceptions import CommandException, UserException
from app.services.command import CommandService
from app.services.user import UserService

router = APIRouter()


@router.post(
    "/upload", response_model=CommandResponse, status_code=status.HTTP_201_CREATED
)
async def upload_command(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    command_service: CommandService = Depends(get_command_service),
    user_service: UserService = Depends(get_user_service),
) -> CustomSlashCommandDict:
    try:
        user_settings = cast(
            UserSettings,
            await user_service.get_user_settings(
                current_user.id, db=db, for_update=True
            ),
        )
    except UserException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    current_commands: list[CustomSlashCommandDict] = (
        user_settings.custom_slash_commands or []
    )

    try:
        command_data = await command_service.upload(
            str(current_user.id), file, current_commands
        )
    except CommandException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    current_commands.append(command_data)
    user_settings.custom_slash_commands = current_commands
    flag_modified(user_settings, "custom_slash_commands")

    try:
        await user_service.commit_settings_and_invalidate_cache(
            user_settings, db, current_user.id
        )
    except Exception as e:
        await command_service.delete(str(current_user.id), command_data["name"])
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save command metadata",
        ) from e

    return command_data


@router.put("/{command_name}", response_model=CommandResponse)
async def update_command(
    command_name: str,
    request: CommandUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    command_service: CommandService = Depends(get_command_service),
    user_service: UserService = Depends(get_user_service),
) -> CustomSlashCommandDict:
    try:
        sanitized_name = command_service.sanitize_name(command_name)
        if sanitized_name != command_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid command name format",
            )
    except CommandException as e:
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

    current_commands: list[CustomSlashCommandDict] = (
        user_settings.custom_slash_commands or []
    )
    command_index = next(
        (i for i, c in enumerate(current_commands) if c.get("name") == command_name),
        None,
    )

    if command_index is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Command '{command_name}' not found",
        )

    try:
        updated_command = await command_service.update(
            str(current_user.id), command_name, request.content, current_commands
        )
    except CommandException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    current_commands[command_index] = updated_command
    user_settings.custom_slash_commands = current_commands
    flag_modified(user_settings, "custom_slash_commands")

    try:
        await user_service.commit_settings_and_invalidate_cache(
            user_settings, db, current_user.id
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update command",
        ) from e

    return updated_command


@router.delete("/{command_name}", response_model=CommandDeleteResponse)
async def delete_command(
    command_name: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    command_service: CommandService = Depends(get_command_service),
    user_service: UserService = Depends(get_user_service),
) -> CommandDeleteResponse:
    try:
        sanitized_name = command_service.sanitize_name(command_name)
        if sanitized_name != command_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid command name format",
            )
    except CommandException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    try:
        user_settings = await user_service.get_user_settings(
            current_user.id, db=db, for_update=True
        )
    except UserException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    current_commands = user_settings.custom_slash_commands or []
    command_index = next(
        (i for i, c in enumerate(current_commands) if c.get("name") == command_name),
        None,
    )

    if command_index is None:
        return CommandDeleteResponse(status="not_found")

    await command_service.delete(str(current_user.id), command_name)

    current_commands.pop(command_index)
    user_settings.custom_slash_commands = current_commands
    flag_modified(user_settings, "custom_slash_commands")

    if user_service.remove_installed_component(
        user_settings, f"command:{command_name}"
    ):
        flag_modified(user_settings, "installed_plugins")

    await user_service.commit_settings_and_invalidate_cache(
        user_settings, db, current_user.id
    )

    return CommandDeleteResponse(status="deleted")
