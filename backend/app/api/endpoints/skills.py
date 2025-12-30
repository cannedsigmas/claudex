from typing import cast

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.deps import get_db, get_skill_service, get_user_service
from app.core.security import get_current_user
from app.models.db_models import User, UserSettings
from app.models.schemas import SkillDeleteResponse, SkillResponse
from app.models.types import CustomSkillDict
from app.services.exceptions import SkillException, UserException
from app.services.skill import SkillService
from app.services.user import UserService

router = APIRouter()


@router.post(
    "/upload", response_model=SkillResponse, status_code=status.HTTP_201_CREATED
)
async def upload_skill(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    skill_service: SkillService = Depends(get_skill_service),
    user_service: UserService = Depends(get_user_service),
) -> CustomSkillDict:
    try:
        user_settings = cast(
            UserSettings,
            await user_service.get_user_settings(
                current_user.id, db=db, for_update=True
            ),
        )
    except UserException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    current_skills: list[CustomSkillDict] = user_settings.custom_skills or []

    try:
        skill_data = await skill_service.upload(
            str(current_user.id), file, current_skills
        )
    except SkillException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    current_skills.append(skill_data)
    user_settings.custom_skills = current_skills
    flag_modified(user_settings, "custom_skills")

    try:
        await user_service.commit_settings_and_invalidate_cache(
            user_settings, db, current_user.id
        )
    except Exception as e:
        await skill_service.delete(str(current_user.id), skill_data["name"])
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save skill metadata",
        ) from e

    return skill_data


@router.delete("/{skill_name}", response_model=SkillDeleteResponse)
async def delete_skill(
    skill_name: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    skill_service: SkillService = Depends(get_skill_service),
    user_service: UserService = Depends(get_user_service),
) -> SkillDeleteResponse:
    try:
        sanitized_name = skill_service.sanitize_name(skill_name)
        if sanitized_name != skill_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid skill name format",
            )
    except SkillException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    try:
        user_settings = await user_service.get_user_settings(
            current_user.id, db=db, for_update=True
        )
    except UserException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    current_skills = user_settings.custom_skills or []
    skill_index = next(
        (i for i, s in enumerate(current_skills) if s.get("name") == skill_name), None
    )

    if skill_index is None:
        return SkillDeleteResponse(status="not_found")

    await skill_service.delete(str(current_user.id), skill_name)

    current_skills.pop(skill_index)
    user_settings.custom_skills = current_skills
    flag_modified(user_settings, "custom_skills")

    if user_service.remove_installed_component(user_settings, f"skill:{skill_name}"):
        flag_modified(user_settings, "installed_plugins")

    await user_service.commit_settings_and_invalidate_cache(
        user_settings, db, current_user.id
    )

    return SkillDeleteResponse(status="deleted")
