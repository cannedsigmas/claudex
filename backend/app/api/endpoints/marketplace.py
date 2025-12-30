from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.deps import (
    get_agent_service,
    get_command_service,
    get_db,
    get_marketplace_service,
    get_plugin_installer_service,
    get_skill_service,
    get_user_service,
)
from app.services.agent import AgentService
from app.services.command import CommandService
from app.services.skill import SkillService
from app.core.security import get_current_user
from app.models.db_models import User, UserSettings
from app.models.schemas.marketplace import (
    InstallComponentRequest,
    InstallComponentResult,
    InstallResponse,
    InstalledPlugin,
    MarketplacePlugin,
    PluginDetails,
    UninstallComponentsRequest,
    UninstallResponse,
)
from app.models.types import (
    CustomAgentDict,
    CustomMcpDict,
    CustomSkillDict,
    CustomSlashCommandDict,
    InstalledPluginDict,
)
from app.services.exceptions import MarketplaceException, UserException
from app.services.marketplace import MarketplaceService
from app.services.plugin_installer import PluginInstallerService
from app.services.user import UserService

router = APIRouter()


def _append_if_not_exists(
    items: list[Any],
    new_item: Any,
) -> None:
    if not any(item.get("name") == new_item.get("name") for item in items):
        items.append(new_item)


@router.get("/catalog", response_model=list[MarketplacePlugin])
async def get_catalog(
    force_refresh: bool = Query(False, description="Force refresh catalog cache"),
    marketplace_service: MarketplaceService = Depends(get_marketplace_service),
) -> list[MarketplacePlugin]:
    try:
        plugins = await marketplace_service.fetch_catalog(force_refresh=force_refresh)
        return [MarketplacePlugin(**p) for p in plugins]
    except MarketplaceException as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))


@router.get("/catalog/{plugin_name}", response_model=PluginDetails)
async def get_plugin_details(
    plugin_name: str,
    marketplace_service: MarketplaceService = Depends(get_marketplace_service),
) -> PluginDetails:
    try:
        details = await marketplace_service.get_plugin_details(plugin_name)
        return PluginDetails(**details)
    except MarketplaceException as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))


@router.post("/install", response_model=InstallResponse)
async def install_plugin_components(
    request: InstallComponentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    marketplace_service: MarketplaceService = Depends(get_marketplace_service),
    installer_service: PluginInstallerService = Depends(get_plugin_installer_service),
    user_service: UserService = Depends(get_user_service),
) -> InstallResponse:
    # 3-phase install to minimize DB lock time:
    # 1. read settings without lock, 2. network IO, 3. short write lock
    try:
        user_settings_readonly = await user_service.get_user_settings(
            current_user.id, db=db, for_update=False
        )
    except UserException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    current_agents: list[CustomAgentDict] = list(
        user_settings_readonly.custom_agents or []
    )
    current_commands: list[CustomSlashCommandDict] = list(
        user_settings_readonly.custom_slash_commands or []
    )
    current_skills: list[CustomSkillDict] = list(
        user_settings_readonly.custom_skills or []
    )
    current_mcps: list[CustomMcpDict] = list(user_settings_readonly.custom_mcps or [])

    try:
        details = await marketplace_service.get_plugin_details(request.plugin_name)
    except MarketplaceException as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))

    try:
        result = await installer_service.install_components(
            user_id=str(current_user.id),
            plugin_name=request.plugin_name,
            components=request.components,
            current_agents=current_agents,
            current_commands=current_commands,
            current_skills=current_skills,
            current_mcps=current_mcps,
        )
    except MarketplaceException as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))

    if result.installed:
        try:
            user_settings = cast(
                UserSettings,
                await user_service.get_user_settings(
                    current_user.id, db=db, for_update=True
                ),
            )
        except UserException as e:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

        if user_settings.custom_agents is None:
            user_settings.custom_agents = []
        for agent in result.new_agents:
            _append_if_not_exists(user_settings.custom_agents, agent)

        if user_settings.custom_slash_commands is None:
            user_settings.custom_slash_commands = []
        for cmd in result.new_commands:
            _append_if_not_exists(user_settings.custom_slash_commands, cmd)

        if user_settings.custom_skills is None:
            user_settings.custom_skills = []
        for skill in result.new_skills:
            _append_if_not_exists(user_settings.custom_skills, skill)

        if user_settings.custom_mcps is None:
            user_settings.custom_mcps = []
        for mcp in result.new_mcps:
            _append_if_not_exists(user_settings.custom_mcps, mcp)

        installed_plugins: list[InstalledPluginDict] = list(
            user_settings.installed_plugins or []
        )
        existing_idx = next(
            (
                i
                for i, p in enumerate(installed_plugins)
                if p["name"] == request.plugin_name
            ),
            None,
        )
        record = installer_service.create_installed_record(
            request.plugin_name,
            details.get("version"),
            result.installed,
        )
        if existing_idx is not None:
            existing_comps = set(installed_plugins[existing_idx].get("components", []))
            existing_comps.update(result.installed)
            record["components"] = list(existing_comps)
            installed_plugins[existing_idx] = record
        else:
            installed_plugins.append(record)
        user_settings.installed_plugins = installed_plugins

        flag_modified(user_settings, "custom_agents")
        flag_modified(user_settings, "custom_slash_commands")
        flag_modified(user_settings, "custom_skills")
        flag_modified(user_settings, "custom_mcps")
        flag_modified(user_settings, "installed_plugins")

        await user_service.commit_settings_and_invalidate_cache(
            user_settings, db, current_user.id
        )

    return InstallResponse(
        plugin_name=request.plugin_name,
        version=details.get("version"),
        installed=result.installed,
        failed=result.failed,
    )


@router.get("/installed", response_model=list[InstalledPlugin])
async def get_installed_plugins(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    user_service: UserService = Depends(get_user_service),
) -> list[InstalledPlugin]:
    try:
        user_settings = await user_service.get_user_settings(current_user.id, db=db)
    except UserException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    installed: list[InstalledPluginDict] = cast(
        list[InstalledPluginDict], user_settings.installed_plugins or []
    )
    return [InstalledPlugin(**p) for p in installed]


@router.post("/uninstall", response_model=UninstallResponse)
async def uninstall_plugin_components(
    request: UninstallComponentsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    user_service: UserService = Depends(get_user_service),
    agent_service: AgentService = Depends(get_agent_service),
    command_service: CommandService = Depends(get_command_service),
    skill_service: SkillService = Depends(get_skill_service),
) -> UninstallResponse:
    try:
        user_settings = cast(
            UserSettings,
            await user_service.get_user_settings(
                current_user.id, db=db, for_update=True
            ),
        )
    except UserException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    uninstalled: list[str] = []
    failed: list[InstallComponentResult] = []
    user_id = str(current_user.id)

    installed_plugins: list[InstalledPluginDict] = list(
        user_settings.installed_plugins or []
    )

    for component_id in request.components:
        if ":" not in component_id:
            failed.append(
                InstallComponentResult(
                    component=component_id,
                    success=False,
                    error="Invalid component format",
                )
            )
            continue

        comp_type, comp_name = component_id.split(":", 1)

        try:
            if comp_type == "agent":
                agents = list(user_settings.custom_agents or [])
                idx = next(
                    (i for i, a in enumerate(agents) if a.get("name") == comp_name),
                    None,
                )
                if idx is not None:
                    await agent_service.delete(user_id, comp_name)
                    agents.pop(idx)
                    user_settings.custom_agents = agents if agents else None
                    uninstalled.append(component_id)
                else:
                    failed.append(
                        InstallComponentResult(
                            component=component_id,
                            success=False,
                            error="Agent not found",
                        )
                    )

            elif comp_type == "command":
                commands = list(user_settings.custom_slash_commands or [])
                idx = next(
                    (i for i, c in enumerate(commands) if c.get("name") == comp_name),
                    None,
                )
                if idx is not None:
                    await command_service.delete(user_id, comp_name)
                    commands.pop(idx)
                    user_settings.custom_slash_commands = commands if commands else None
                    uninstalled.append(component_id)
                else:
                    failed.append(
                        InstallComponentResult(
                            component=component_id,
                            success=False,
                            error="Command not found",
                        )
                    )

            elif comp_type == "skill":
                skills = list(user_settings.custom_skills or [])
                idx = next(
                    (i for i, s in enumerate(skills) if s.get("name") == comp_name),
                    None,
                )
                if idx is not None:
                    await skill_service.delete(user_id, comp_name)
                    skills.pop(idx)
                    user_settings.custom_skills = skills if skills else None
                    uninstalled.append(component_id)
                else:
                    failed.append(
                        InstallComponentResult(
                            component=component_id,
                            success=False,
                            error="Skill not found",
                        )
                    )

            elif comp_type == "mcp":
                mcps = list(user_settings.custom_mcps or [])
                idx = next(
                    (i for i, m in enumerate(mcps) if m.get("name") == comp_name), None
                )
                if idx is not None:
                    mcps.pop(idx)
                    user_settings.custom_mcps = mcps if mcps else None
                    uninstalled.append(component_id)
                else:
                    failed.append(
                        InstallComponentResult(
                            component=component_id, success=False, error="MCP not found"
                        )
                    )

            else:
                failed.append(
                    InstallComponentResult(
                        component=component_id,
                        success=False,
                        error=f"Unknown component type: {comp_type}",
                    )
                )

        except Exception as e:
            failed.append(
                InstallComponentResult(
                    component=component_id, success=False, error=str(e)
                )
            )

    if uninstalled:
        plugin_idx = next(
            (
                i
                for i, p in enumerate(installed_plugins)
                if p.get("name") == request.plugin_name
            ),
            None,
        )
        if plugin_idx is not None:
            plugin = installed_plugins[plugin_idx]
            remaining = [
                c for c in plugin.get("components", []) if c not in uninstalled
            ]
            if remaining:
                plugin["components"] = remaining
            else:
                installed_plugins.pop(plugin_idx)
            user_settings.installed_plugins = (
                installed_plugins if installed_plugins else None
            )

        flag_modified(user_settings, "custom_agents")
        flag_modified(user_settings, "custom_slash_commands")
        flag_modified(user_settings, "custom_skills")
        flag_modified(user_settings, "custom_mcps")
        flag_modified(user_settings, "installed_plugins")

        await user_service.commit_settings_and_invalidate_cache(
            user_settings, db, current_user.id
        )

    return UninstallResponse(
        plugin_name=request.plugin_name,
        uninstalled=uninstalled,
        failed=failed,
    )
