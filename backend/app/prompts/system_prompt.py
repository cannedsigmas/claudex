from datetime import datetime
from typing import TYPE_CHECKING

from app.constants import DOCKER_AVAILABLE_PORTS
from app.core.config import get_settings

if TYPE_CHECKING:
    from app.models.db_models import UserSettings


def _get_github_section(github_token_configured: bool) -> str:
    if not github_token_configured:
        return ""
    return """
<github_integration>
- Use `gh` CLI for GitHub operations (PRs, issues, API)
- Examples: `gh pr list`, `gh pr view 193 --json number,title,body,headRefName,baseRefName,commits`, `gh pr diff 193` (where 193 is PR number)
- Commit messages should reference test/issue IDs when applicable
</github_integration>
"""


def _get_env_vars_section(env_vars_formatted: str | None) -> str:
    if not env_vars_formatted:
        return ""
    return f"""

<available_env_variables>
- Available custom environment variables: {env_vars_formatted}
- Use these directly without prompting users for API keys or credentials
- Already set in the sandbox environment and ready for immediate use
</available_env_variables>
"""


def _get_runtime_context_section(
    sandbox_id: str,
    current_date: str,
    sandbox_provider: str,
    docker_preview_base_url: str,
) -> str:
    if sandbox_provider == "docker":
        ports_str = ", ".join(str(p) for p in DOCKER_AVAILABLE_PORTS)
        return f"""<runtime_context>
- Workspace: /home/user
- Sandbox: {sandbox_id}
- Date: {current_date}
- Sandbox Provider: Docker (local)
- Available ports for dev servers: {ports_str}
- IMPORTANT: Only use ports from the available ports list above. Other ports will not be accessible.
- IMPORTANT: Do NOT tell users specific localhost URLs. The actual port is dynamically mapped. Direct users to check the Preview panel for the correct URL.
</runtime_context>"""
    return f"""<runtime_context>
- Workspace: /home/user
- Sandbox: {sandbox_id}
- Date: {current_date}
- Sandbox Provider: E2B (cloud)
- Public URL pattern: https://<port>-{sandbox_id}.e2b.dev
</runtime_context>"""


def get_system_prompt(
    sandbox_id: str,
    sandbox_provider: str = "e2b",
    docker_preview_base_url: str = "http://localhost",
    github_token_configured: bool = False,
    env_vars_formatted: str | None = None,
) -> str:
    current_date = datetime.utcnow().strftime("%Y-%m-%d")
    runtime_section = _get_runtime_context_section(
        sandbox_id, current_date, sandbox_provider, docker_preview_base_url
    )
    github_section = _get_github_section(github_token_configured)
    env_section = _get_env_vars_section(env_vars_formatted)

    return f"""
{runtime_section}

{github_section}

{env_section}
"""


def build_custom_system_prompt(
    custom_prompt_content: str,
    sandbox_id: str,
    sandbox_provider: str = "e2b",
    docker_preview_base_url: str = "http://localhost",
    github_token_configured: bool = False,
    env_vars_formatted: str | None = None,
) -> str:
    current_date = datetime.utcnow().strftime("%Y-%m-%d")
    runtime_section = _get_runtime_context_section(
        sandbox_id, current_date, sandbox_provider, docker_preview_base_url
    )
    github_section = _get_github_section(github_token_configured)
    env_section = _get_env_vars_section(env_vars_formatted)

    return f"""
{custom_prompt_content}

{runtime_section}

{github_section}

{env_section}
"""


def build_system_prompt_for_chat(
    sandbox_id: str,
    user_settings: "UserSettings | None",
    selected_prompt_name: str | None = None,
) -> str:
    github_token_configured = bool(
        user_settings and user_settings.github_personal_access_token
    )
    env_vars_formatted = None
    if user_settings and user_settings.custom_env_vars:
        env_vars_formatted = "\n".join(
            f"- {env_var['key']}" for env_var in user_settings.custom_env_vars
        )
    config = get_settings()
    sandbox_provider = (
        user_settings.sandbox_provider if user_settings else None
    ) or config.SANDBOX_PROVIDER
    docker_preview_base_url = config.DOCKER_PREVIEW_BASE_URL

    if selected_prompt_name and user_settings and user_settings.custom_prompts:
        custom_prompt = next(
            (
                p
                for p in user_settings.custom_prompts
                if p.get("name") == selected_prompt_name
            ),
            None,
        )
        if custom_prompt:
            return build_custom_system_prompt(
                custom_prompt["content"],
                sandbox_id,
                sandbox_provider,
                docker_preview_base_url,
                github_token_configured,
                env_vars_formatted,
            )

    return get_system_prompt(
        sandbox_id,
        sandbox_provider,
        docker_preview_base_url,
        github_token_configured,
        env_vars_formatted,
    )
