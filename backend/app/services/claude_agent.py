import logging
import re
from collections.abc import AsyncIterator, Callable
from types import TracebackType
from typing import Any, Literal, Self

from claude_agent_sdk import (
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ClaudeSDKError,
    ResultMessage,
    TextBlock,
    UserMessage,
)
from app.core.config import get_settings
from app.core.security import create_chat_scoped_token
from app.db.session import SessionLocal
from app.models.db_models import Chat, User, UserSettings
from app.models.db_models.enums import ModelProvider
from app.prompts.enhance_prompt import get_enhance_prompt
from app.services.ai_model import AIModelService
from app.services.transports import DockerSandboxTransport, E2BSandboxTransport
from app.services.exceptions import ClaudeAgentException
from app.services.sandbox_providers import SandboxProviderType, create_docker_config
from app.services.streaming.events import StreamEvent
from app.services.streaming.processor import StreamProcessor
from app.services.tool_handler import ToolHandlerRegistry
from app.services.user import UserService
from app.utils.validators import APIKeyValidationError, validate_e2b_api_key

SDKPermissionMode = Literal["default", "acceptEdits", "plan", "bypassPermissions"]

settings = get_settings()
logger = logging.getLogger(__name__)

THINKING_MODE_TOKENS = {
    "low": 4000,
    "medium": 10000,
    "high": 15000,
    "ultra": 32000,
}
ALLOWED_SLASH_COMMANDS = [
    "/context",
    "/compact",
    "/pr-comments",
    "/review",
    "/init",
]
SDK_PERMISSION_MODE_MAP: dict[str, SDKPermissionMode] = {
    "plan": "plan",
    "ask": "default",
    "auto": "default",
}


MCP_TYPE_CONFIGS: dict[str, dict[str, Any]] = {
    "npx": {
        "command": "npx",
        "required_field": "package",
        "args_prefix": ("-y",),
    },
    "bunx": {
        "command": "bunx",
        "required_field": "package",
        "args_prefix": (),
    },
    "uvx": {
        "command": "uvx",
        "required_field": "package",
        "args_prefix": (),
    },
    "http": {
        "type": "http",
        "required_field": "url",
        "is_http": True,
    },
}


class SessionHandler:
    def __init__(self, session_callback: Callable[[str], None] | None) -> None:
        self.session_callback = session_callback

    def __call__(self, new_session_id: str) -> None:
        if self.session_callback:
            self.session_callback(new_session_id)


class ClaudeAgentService:
    def __init__(self, session_factory: Callable[..., Any] | None = None) -> None:
        self.tool_registry = ToolHandlerRegistry()
        self.session_factory = session_factory or SessionLocal
        self._total_cost_usd = 0.0
        self._active_transport: E2BSandboxTransport | DockerSandboxTransport | None = (
            None
        )

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> bool:
        try:
            await self.cancel_active_stream()
        except Exception as cleanup_error:
            logger.error(
                f"Error during ClaudeAgentService cleanup: {cleanup_error}",
                exc_info=True,
            )
            if exc_type is None:
                raise
        return False

    def _create_sandbox_transport(
        self,
        sandbox_provider: str,
        sandbox_id: str,
        prompt_iterable: AsyncIterator[dict[str, Any]],
        options: ClaudeAgentOptions,
        user_settings: UserSettings | None = None,
        e2b_api_key: str | None = None,
    ) -> E2BSandboxTransport | DockerSandboxTransport:
        if sandbox_provider == SandboxProviderType.DOCKER:
            docker_config = create_docker_config()
            return DockerSandboxTransport(
                sandbox_id=sandbox_id,
                docker_config=docker_config,
                prompt=prompt_iterable,
                options=options,
            )

        if e2b_api_key is None and user_settings is not None:
            try:
                e2b_api_key = validate_e2b_api_key(user_settings)
            except APIKeyValidationError as e:
                raise ClaudeAgentException(str(e)) from e

        if e2b_api_key is None:
            raise ClaudeAgentException(
                "E2B API key is required for E2B sandbox provider"
            )

        return E2BSandboxTransport(
            sandbox_id=sandbox_id,
            api_key=e2b_api_key,
            prompt=prompt_iterable,
            options=options,
        )

    async def get_ai_stream(
        self,
        prompt: str,
        system_prompt: str,
        custom_instructions: str | None,
        user: User,
        chat: Chat,
        model_id: str,
        permission_mode: str = "auto",
        session_id: str | None = None,
        session_callback: Callable[[str], None] | None = None,
        thinking_mode: str | None = None,
        attachments: list[dict[str, Any]] | None = None,
        is_custom_prompt: bool = False,
    ) -> AsyncIterator[StreamEvent]:
        chat_id = str(chat.id)
        user_settings = await UserService(
            session_factory=self.session_factory
        ).get_user_settings(user.id)

        self._total_cost_usd = 0.0

        sandbox_provider = chat.sandbox_provider or user_settings.sandbox_provider

        options = await self._build_claude_options(
            user=user,
            user_settings=user_settings,
            system_prompt=system_prompt,
            permission_mode=permission_mode,
            model_id=model_id,
            session_id=session_id,
            thinking_mode=thinking_mode,
            chat_id=chat_id,
            sandbox_provider=sandbox_provider,
            is_custom_prompt=is_custom_prompt,
        )

        user_prompt = self.prepare_user_prompt(prompt, custom_instructions, attachments)
        sandbox_id = chat.sandbox_id
        if not sandbox_id:
            raise ClaudeAgentException(
                "Chat does not have an associated sandbox environment"
            )
        sandbox_id_str = str(sandbox_id)

        prompt_message = {
            "type": "user",
            "message": {"role": "user", "content": user_prompt},
            "parent_tool_use_id": None,
            "session_id": session_id,
        }
        prompt_iterable = self._create_prompt_iterable(prompt_message)

        transport = self._create_sandbox_transport(
            sandbox_provider=sandbox_provider,
            sandbox_id=sandbox_id_str,
            prompt_iterable=prompt_iterable,
            options=options,
            user_settings=user_settings,
        )

        async with transport:
            self._active_transport = transport

            processor = StreamProcessor(
                tool_registry=self.tool_registry,
                session_handler=self._create_session_handler(session_callback),
            )

            try:
                async with ClaudeSDKClient(
                    options=options, transport=transport
                ) as client:
                    await client.query(prompt_iterable)
                    async for message in client.receive_response():
                        for event in processor.emit_events_for_message(message):
                            if event:
                                yield event
                                if event.get("tool", {}).get("name") == "ExitPlanMode":
                                    await client.set_permission_mode("auto")

                self._total_cost_usd = processor.total_cost_usd

            except ClaudeSDKError as e:
                raise ClaudeAgentException(f"Claude SDK error: {str(e)}")

            finally:
                self._active_transport = None

    def get_total_cost_usd(self) -> float:
        return self._total_cost_usd

    def _create_session_handler(
        self, session_callback: Callable[[str], None] | None
    ) -> SessionHandler:
        return SessionHandler(session_callback)

    async def cancel_active_stream(self) -> None:
        if self._active_transport:
            try:
                await self._active_transport.close()
            except Exception as e:
                logger.error("Error closing transport: %s", e)
            finally:
                self._active_transport = None

    async def _build_auth_env(
        self, model_id: str, user_settings: UserSettings
    ) -> tuple[dict[str, str], ModelProvider | None]:
        # Model-specific environment configuration:
        # - Z.AI models: Route through Z.AI's Anthropic-compatible API using user's Z.AI API key
        # - OpenRouter models: Route through local CCR proxy (127.0.0.1:3456) with special config
        # - Default (Anthropic models): Use user's Claude OAuth token directly
        ai_model_service = AIModelService(session_factory=self.session_factory)
        provider = await ai_model_service.get_model_provider(model_id)

        env: dict[str, str] = {}
        if provider == ModelProvider.ZAI and user_settings.z_ai_api_key:
            env["ANTHROPIC_AUTH_TOKEN"] = user_settings.z_ai_api_key
            env["ANTHROPIC_BASE_URL"] = "https://api.z.ai/api/anthropic"
        elif (
            provider == ModelProvider.ANTHROPIC
            and user_settings.claude_code_oauth_token
        ):
            env["CLAUDE_CODE_OAUTH_TOKEN"] = user_settings.claude_code_oauth_token

        return env, provider

    async def enhance_prompt(self, prompt: str, model_id: str, user: User) -> str:
        user_settings = await UserService(
            session_factory=self.session_factory
        ).get_user_settings(user.id)
        env, _ = await self._build_auth_env(model_id, user_settings)

        options = ClaudeAgentOptions(
            system_prompt=get_enhance_prompt(),
            permission_mode="bypassPermissions",
            model=model_id,
            max_turns=1,
            env=env,
        )

        enhanced_text = ""
        try:
            async with ClaudeSDKClient(options=options) as client:
                await client.query(f"Enhance this prompt: {prompt}")
                async for message in client.receive_response():
                    if isinstance(message, ResultMessage) and message.result:
                        enhanced_text = message.result

            return enhanced_text or prompt

        except ClaudeSDKError as e:
            raise ClaudeAgentException(f"Failed to enhance prompt: {str(e)}")

    def _build_permission_server(
        self, permission_mode: str, chat_id: str, sandbox_provider: str = "docker"
    ) -> dict[str, Any]:
        # MCP permission server runs inside sandbox containers and makes HTTP requests
        # to our backend API for user approval flows (e.g., EnterPlanMode, AskUserQuestion).
        #
        # Network connectivity varies by environment:
        # - E2B (cloud): Uses settings.BASE_URL (must be publicly accessible or tunneled)
        # - E2B (local dev): Requires a tunnel (ngrok, cloudflare) since the sandbox can't reach localhost
        # - Docker (local): Uses host.docker.internal to reach the host machine
        # - Docker (production/Coolify): host.docker.internal often doesn't work on Linux VPS.
        #   Set DOCKER_PERMISSION_API_URL to the internal container name (e.g., http://api:8080)
        #   or public URL (e.g., https://your-domain.com) for sandbox->API connectivity.
        chat_token = create_chat_scoped_token(chat_id)

        if sandbox_provider == SandboxProviderType.DOCKER:
            if settings.DOCKER_PERMISSION_API_URL:
                api_base_url = settings.DOCKER_PERMISSION_API_URL
            else:
                base_url = settings.BASE_URL
                port = (
                    base_url.rsplit(":", maxsplit=1)[-1].rstrip("/")
                    if ":" in base_url
                    else "8080"
                )
                api_base_url = f"http://host.docker.internal:{port}"
        else:
            api_base_url = settings.BASE_URL

        return {
            "command": "python3",
            "args": ["-u", "/usr/local/bin/permission_server.py"],
            "env": {
                "PYTHONUNBUFFERED": "1",
                "PERMISSION_MODE": permission_mode,
                "API_BASE_URL": api_base_url,
                "CHAT_TOKEN": chat_token,
                "CHAT_ID": chat_id,
            },
        }

    def _build_zai_servers(self, z_ai_api_key: str) -> dict[str, Any]:
        return {
            "zai-mcp-server": self._npx_server_config(
                "@z_ai/mcp-server",
                env={"Z_AI_API_KEY": z_ai_api_key, "Z_AI_MODE": "ZAI"},
            ),
            "web-search-prime": {
                "type": "http",
                "url": "https://api.z.ai/api/mcp/web_search_prime/mcp",
                "headers": {"Authorization": f"Bearer {z_ai_api_key}"},
            },
        }

    def build_custom_mcps(self, custom_mcps: list[Any]) -> dict[str, Any]:
        servers = {}
        for mcp in custom_mcps:
            if not mcp.get("enabled", True):
                continue

            mcp_name = mcp.get("name")
            command_type = mcp.get("command_type")

            if not mcp_name or not command_type:
                continue

            try:
                servers[mcp_name] = self.build_mcp_config(mcp, command_type)
            except ClaudeAgentException as e:
                logger.error(
                    f"Failed to configure MCP '{mcp_name}': {e}", exc_info=True
                )
        return servers

    async def _get_mcp_servers(
        self,
        user: User,
        permission_mode: str,
        chat_id: str,
        use_zai_mcp: bool,
        sandbox_provider: str = "docker",
    ) -> dict[str, Any]:
        user_settings = await UserService(
            session_factory=self.session_factory
        ).get_user_settings(user.id)

        servers = {
            "permission": self._build_permission_server(
                permission_mode, chat_id, sandbox_provider
            )
        }

        if use_zai_mcp and user_settings.z_ai_api_key:
            servers.update(self._build_zai_servers(user_settings.z_ai_api_key))

        if user_settings.custom_mcps:
            servers.update(self.build_custom_mcps(user_settings.custom_mcps))

        return servers

    def build_mcp_config(
        self, mcp: dict[str, Any], command_type: str
    ) -> dict[str, Any]:
        type_config = MCP_TYPE_CONFIGS.get(command_type)
        if not type_config:
            raise ClaudeAgentException(f"Unknown MCP command type: {command_type}")

        mcp_name = mcp.get("name", "unknown")
        required_field = type_config["required_field"]

        if not mcp.get(required_field):
            raise ClaudeAgentException(
                f"{command_type.upper()} MCP '{mcp_name}' requires '{required_field}' field"
            )

        if type_config.get("is_http"):
            config = {
                "type": type_config["type"],
                "url": mcp[required_field],
            }
            if mcp.get("env_vars"):
                config["headers"] = mcp["env_vars"]
        else:
            args = list(type_config["args_prefix"]) + [mcp[required_field]]
            if mcp.get("args"):
                args.extend(mcp["args"])
            config = {
                "command": type_config["command"],
                "args": args,
            }
            if mcp.get("env_vars"):
                config["env"] = mcp["env_vars"]

        return config

    @staticmethod
    def _npx_server_config(
        package: str,
        *,
        env: dict[str, str] | None = None,
        extra_args: list[str] | None = None,
    ) -> dict[str, Any]:
        args = ["-y", package]
        if extra_args:
            args.extend(extra_args)
        config: dict[str, object] = {"command": "npx", "args": args}
        if env:
            config["env"] = env
        return config

    async def _build_claude_options(
        self,
        *,
        user: User,
        user_settings: UserSettings,
        system_prompt: str,
        permission_mode: str,
        model_id: str,
        session_id: str | None,
        thinking_mode: str | None,
        chat_id: str,
        sandbox_provider: str = "docker",
        is_custom_prompt: bool = False,
    ) -> ClaudeAgentOptions:
        env, provider = await self._build_auth_env(model_id, user_settings)

        if user_settings.github_personal_access_token:
            env["GITHUB_TOKEN"] = user_settings.github_personal_access_token
            env["GIT_ASKPASS"] = "/home/user/.git-askpass.sh"
            env["GIT_AUTHOR_NAME"] = "Claudex"
            env["GIT_AUTHOR_EMAIL"] = "noreply@claudex.com"
            env["GIT_COMMITTER_NAME"] = "Claudex"
            env["GIT_COMMITTER_EMAIL"] = "noreply@claudex.com"

        if user_settings.custom_env_vars:
            for env_var in user_settings.custom_env_vars:
                env[env_var["key"]] = env_var["value"]

        if provider == ModelProvider.OPENROUTER and user_settings.openrouter_api_key:
            env["ANTHROPIC_BASE_URL"] = "http://127.0.0.1:3456"
            env["ANTHROPIC_AUTH_TOKEN"] = "placeholder"
            env["NO_PROXY"] = "127.0.0.1"
            env["DISABLE_TELEMETRY"] = "true"
            env["DISABLE_COST_WARNING"] = "true"

        disallowed_tools = []
        if provider != ModelProvider.ANTHROPIC:
            disallowed_tools.append("WebSearch")

        sdk_permission_mode: SDKPermissionMode = SDK_PERMISSION_MODE_MAP.get(
            permission_mode, "bypassPermissions"
        )

        system_prompt_config: str | dict[str, str]
        if is_custom_prompt:
            system_prompt_config = system_prompt
        else:
            system_prompt_config = {
                "type": "preset",
                "preset": "claude_code",
                "append": system_prompt,
            }

        options = ClaudeAgentOptions(
            system_prompt=system_prompt_config,
            permission_mode=sdk_permission_mode,
            model=model_id,
            disallowed_tools=disallowed_tools,
            mcp_servers=await self._get_mcp_servers(
                user,
                permission_mode,
                chat_id,
                provider == ModelProvider.ZAI,
                sandbox_provider,
            ),
            cwd="/home/user",
            user="user",
            resume=session_id,
            env=env,
            setting_sources=["local", "user", "project"],
            permission_prompt_tool_name="mcp__permission__approval_prompt",
        )

        if thinking_mode in THINKING_MODE_TOKENS:
            options.max_thinking_tokens = THINKING_MODE_TOKENS[thinking_mode]

        return options

    def prepare_user_prompt(
        self,
        prompt: str,
        custom_instructions: str | None,
        attachments: list[dict[str, Any]] | None = None,
    ) -> str:
        if any(prompt.startswith(cmd) for cmd in ALLOWED_SLASH_COMMANDS):
            return prompt

        parts = []

        if custom_instructions and custom_instructions.strip():
            parts.append(
                f"<user_instructions>\n{custom_instructions.strip()}\n</user_instructions>\n\n"
            )

        if attachments:
            files_list = "\n".join(
                f"- /home/user/{attachment['file_path'].split('/')[-1]}"
                for attachment in attachments
            )
            parts.append(
                f"<user_attachments>\nUser uploaded the following files\n{files_list}\n</user_attachments>\n\n"
            )

        parts.append(f"<user_prompt>{prompt}</user_prompt>")
        return "".join(parts)

    @staticmethod
    async def _create_prompt_iterable(
        prompt_message: dict[str, Any],
    ) -> AsyncIterator[dict[str, Any]]:
        yield prompt_message

    async def get_context_token_usage(
        self,
        session_id: str,
        sandbox_id: str,
        sandbox_provider: str,
        model_id: str,
        user_settings: UserSettings,
        e2b_api_key: str | None = None,
    ) -> int | None:
        try:
            env, _ = await self._build_auth_env(model_id, user_settings)

            options = ClaudeAgentOptions(
                system_prompt="",
                permission_mode="bypassPermissions",
                model=model_id,
                cwd="/home/user",
                user="user",
                resume=session_id,
                env=env,
            )

            prompt_message = {
                "type": "user",
                "message": {"role": "user", "content": "/context"},
                "parent_tool_use_id": None,
                "session_id": session_id,
            }

            prompt_iterable = self._create_prompt_iterable(prompt_message)

            if sandbox_provider != SandboxProviderType.DOCKER and not e2b_api_key:
                logger.warning(
                    "Skipping context usage fetch: E2B API key not configured"
                )
                return None

            transport = self._create_sandbox_transport(
                sandbox_provider=sandbox_provider,
                sandbox_id=sandbox_id,
                prompt_iterable=prompt_iterable,
                options=options,
                e2b_api_key=e2b_api_key,
            )

            async with transport:
                self._active_transport = transport

                response_content = ""
                try:
                    async with ClaudeSDKClient(
                        options=options, transport=transport
                    ) as client:
                        await client.query(prompt_iterable)
                        async for message in client.receive_response():
                            if isinstance(message, UserMessage):
                                if isinstance(message.content, str):
                                    response_content += message.content
                                elif isinstance(message.content, list):
                                    for item in message.content:
                                        if isinstance(item, TextBlock) and item.text:
                                            response_content += item.text
                finally:
                    self._active_transport = None

            if not response_content:
                return None

            # The Claude CLI outputs context info in a specific format:
            #   <local-command-stdout>...**Tokens:** 12.5k...</local-command-stdout>
            # Parse with regex to extract token count in thousands (e.g., "12.5k" -> 12500)
            stdout_match = re.search(
                r"<local-command-stdout>(.*?)</local-command-stdout>",
                response_content,
                re.DOTALL,
            )
            if stdout_match:
                token_match = re.search(
                    r"\*\*Tokens:\*\*\s*(\d+(?:\.\d+)?)k", stdout_match.group(1)
                )
                if token_match:
                    return int(float(token_match.group(1)) * 1000)

            return None

        except Exception as e:
            logger.error("Failed to get context token usage: %s", e)
            return None
