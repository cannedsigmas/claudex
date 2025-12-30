import io
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal, cast

from fastapi import UploadFile

from app.models.schemas.marketplace import InstallComponentResult
from app.models.types import (
    CustomAgentDict,
    CustomMcpDict,
    CustomSkillDict,
    CustomSlashCommandDict,
    InstalledPluginDict,
    PluginComponentsDict,
)
from app.services.agent import AgentService
from app.services.command import CommandService
from app.services.marketplace import MarketplaceService
from app.services.skill import SkillService

logger = logging.getLogger(__name__)

McpCommandType = Literal["npx", "bunx", "uvx"]
SUPPORTED_MCP_COMMANDS: set[McpCommandType] = {"npx", "bunx", "uvx"}


@dataclass
class InstallResult:
    installed: list[str]
    failed: list[InstallComponentResult]
    new_agents: list[CustomAgentDict]
    new_commands: list[CustomSlashCommandDict]
    new_skills: list[CustomSkillDict]
    new_mcps: list[CustomMcpDict]


class PluginInstallerService:
    def __init__(self) -> None:
        self.marketplace = MarketplaceService()
        self.skill_service = SkillService()
        self.agent_service = AgentService()
        self.command_service = CommandService()

    async def install_components(
        self,
        user_id: str,
        plugin_name: str,
        components: list[str],
        current_agents: list[CustomAgentDict],
        current_commands: list[CustomSlashCommandDict],
        current_skills: list[CustomSkillDict],
        current_mcps: list[CustomMcpDict],
    ) -> InstallResult:
        details = await self.marketplace.get_plugin_details(plugin_name)
        source = details.get("source", "")
        available_components = details.get("components", {})

        installed: list[str] = []
        failed: list[InstallComponentResult] = []
        new_agents: list[CustomAgentDict] = []
        new_commands: list[CustomSlashCommandDict] = []
        new_skills: list[CustomSkillDict] = []
        new_mcps: list[CustomMcpDict] = []

        for component in components:
            if ":" not in component:
                failed.append(
                    InstallComponentResult(
                        component=component,
                        success=False,
                        error="Invalid component format (expected 'type:name')",
                    )
                )
                continue

            comp_type, comp_name = component.split(":", 1)

            validation_error = self._validate_component(
                comp_type, comp_name, available_components
            )
            if validation_error:
                failed.append(
                    InstallComponentResult(
                        component=component,
                        success=False,
                        error=validation_error,
                    )
                )
                continue

            try:
                if comp_type == "agent":
                    agent = await self._install_agent(
                        user_id, source, comp_name, current_agents
                    )
                    new_agents.append(agent)
                    installed.append(component)
                elif comp_type == "command":
                    cmd = await self._install_command(
                        user_id, source, comp_name, current_commands
                    )
                    new_commands.append(cmd)
                    installed.append(component)
                elif comp_type == "skill":
                    skill = await self._install_skill(
                        user_id, source, comp_name, current_skills
                    )
                    new_skills.append(skill)
                    installed.append(component)
                elif comp_type == "mcp":
                    mcp = await self._install_mcp(source, comp_name, current_mcps)
                    if mcp:
                        new_mcps.append(mcp)
                        installed.append(component)
                    else:
                        failed.append(
                            InstallComponentResult(
                                component=component,
                                success=False,
                                error="MCP server uses unsupported command type",
                            )
                        )
                else:
                    failed.append(
                        InstallComponentResult(
                            component=component,
                            success=False,
                            error=f"Unknown component type: {comp_type}",
                        )
                    )
            except Exception as e:
                logger.error(f"Failed to install {component}: {e}")
                failed.append(
                    InstallComponentResult(
                        component=component, success=False, error=str(e)
                    )
                )

        return InstallResult(
            installed=installed,
            failed=failed,
            new_agents=new_agents,
            new_commands=new_commands,
            new_skills=new_skills,
            new_mcps=new_mcps,
        )

    def _validate_component(
        self,
        comp_type: str,
        comp_name: str,
        available: PluginComponentsDict,
    ) -> str | None:
        if comp_type == "agent":
            if comp_name not in available.get("agents", []):
                return f"Agent '{comp_name}' not found in plugin"
        elif comp_type == "command":
            if comp_name not in available.get("commands", []):
                return f"Command '{comp_name}' not found in plugin"
        elif comp_type == "skill":
            if comp_name not in available.get("skills", []):
                return f"Skill '{comp_name}' not found in plugin"
        elif comp_type == "mcp":
            if comp_name not in available.get("mcp_servers", []):
                return f"MCP server '{comp_name}' not found in plugin"
        elif comp_type not in ("agent", "command", "skill", "mcp"):
            return f"Unknown component type: {comp_type}"
        return None

    async def _install_agent(
        self,
        user_id: str,
        source: str,
        agent_name: str,
        current_agents: list[CustomAgentDict],
    ) -> CustomAgentDict:
        content = await self.marketplace.download_agent(source, agent_name)
        file = self._create_upload_file(f"{agent_name}.md", content)
        return await self.agent_service.upload(user_id, file, current_agents)

    async def _install_command(
        self,
        user_id: str,
        source: str,
        command_name: str,
        current_commands: list[CustomSlashCommandDict],
    ) -> CustomSlashCommandDict:
        content = await self.marketplace.download_command(source, command_name)
        file = self._create_upload_file(f"{command_name}.md", content)
        return await self.command_service.upload(user_id, file, current_commands)

    async def _install_skill(
        self,
        user_id: str,
        source: str,
        skill_name: str,
        current_skills: list[CustomSkillDict],
    ) -> CustomSkillDict:
        zip_content = await self.marketplace.download_skill_as_zip(source, skill_name)
        file = self._create_upload_file(f"{skill_name}.zip", zip_content)
        return await self.skill_service.upload(user_id, file, current_skills)

    async def _install_mcp(
        self,
        source: str,
        mcp_name: str,
        current_mcps: list[CustomMcpDict],
    ) -> CustomMcpDict | None:
        config = await self.marketplace.download_mcp_config(source)
        if not config:
            return None

        servers = config.get("mcpServers") or config
        server_config = servers.get(mcp_name)
        if not server_config:
            return None

        if any(m.get("name") == mcp_name for m in current_mcps):
            raise Exception(f"MCP server '{mcp_name}' already exists")

        return self._convert_mcp_config(mcp_name, server_config)

    def _convert_mcp_config(
        self, name: str, config: dict[str, Any]
    ) -> CustomMcpDict | None:
        command = config.get("command", "")
        args = config.get("args", [])

        if command not in SUPPORTED_MCP_COMMANDS:
            logger.warning(f"MCP server '{name}' uses unsupported command: {command}")
            return None

        command_type = cast(McpCommandType, command)
        package: str | None = None
        filtered_args: list[str] = []

        # parse npx/bunx/uvx args: extract package name from "-y <pkg>" or first non-flag arg
        skip_next = False
        for i, arg in enumerate(args):
            if skip_next:
                skip_next = False
                continue
            if arg == "-y":
                skip_next = True
                if i + 1 < len(args):
                    package = args[i + 1]
            elif arg.startswith("@") or (not arg.startswith("-") and not package):
                package = arg
            else:
                filtered_args.append(arg)

        return {
            "name": name,
            "description": f"MCP server from marketplace: {name}",
            "command_type": command_type,
            "package": package,
            "url": None,
            "env_vars": config.get("env"),
            "args": filtered_args if filtered_args else None,
            "enabled": True,
        }

    def _create_upload_file(self, filename: str, content: bytes) -> UploadFile:
        file_obj = io.BytesIO(content)
        return UploadFile(file=file_obj, filename=filename)

    def create_installed_record(
        self,
        plugin_name: str,
        version: str | None,
        components: list[str],
    ) -> InstalledPluginDict:
        return {
            "name": plugin_name,
            "version": version,
            "installed_at": datetime.now(timezone.utc).isoformat(),
            "components": components,
        }
