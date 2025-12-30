import io
import json
import logging
import re
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, cast

import httpx

from app.core.config import get_settings
from app.models.types import (
    MarketplaceAuthorDict,
    MarketplacePluginDict,
    PluginComponentsDict,
    PluginDetailsDict,
)
from app.services.exceptions import ErrorCode, MarketplaceException

settings = get_settings()
logger = logging.getLogger(__name__)

CATALOG_URL = "https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json"
REPO_RAW_BASE = (
    "https://raw.githubusercontent.com/anthropics/claude-plugins-official/main"
)
GITHUB_API_BASE = (
    "https://api.github.com/repos/anthropics/claude-plugins-official/contents"
)
CACHE_TTL_SECONDS = 3600
MAX_RECURSION_DEPTH = 5
MAX_SKILL_FILES = 50

_catalog_cache: list[MarketplacePluginDict] | None = None
_catalog_cached_at: datetime | None = None
SAFE_PATH_SEGMENT = re.compile(r"^[a-zA-Z0-9_\-\.]+$")


def _validate_path_segment(segment: str) -> bool:
    if not segment:
        return False
    if segment in (".", ".."):
        return False
    if not SAFE_PATH_SEGMENT.match(segment):
        return False
    return True


def _validate_source_path(source: str) -> str:
    if source.startswith("./"):
        source = source[2:]
    if source.startswith("/"):
        raise MarketplaceException(
            "Invalid source path: absolute paths not allowed",
            error_code=ErrorCode.MARKETPLACE_INSTALL_FAILED,
        )
    segments = source.split("/")
    for seg in segments:
        if seg and not _validate_path_segment(seg):
            raise MarketplaceException(
                f"Invalid path segment: {seg}",
                error_code=ErrorCode.MARKETPLACE_INSTALL_FAILED,
            )
    return source


def _validate_component_name(name: str) -> str:
    if not _validate_path_segment(name):
        raise MarketplaceException(
            f"Invalid component name: {name}",
            error_code=ErrorCode.MARKETPLACE_INSTALL_FAILED,
        )
    return name


class MarketplaceService:
    def __init__(self) -> None:
        self.cache_path = Path(settings.STORAGE_PATH) / "marketplace_cache"
        self.cache_path.mkdir(parents=True, exist_ok=True)
        self._cache_file = self.cache_path / "catalog.json"

    async def fetch_catalog(
        self, force_refresh: bool = False
    ) -> list[MarketplacePluginDict]:
        global _catalog_cache, _catalog_cached_at

        if not force_refresh and self._is_cache_valid():
            return _catalog_cache or []

        if not force_refresh and self._load_disk_cache():
            return _catalog_cache or []

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(CATALOG_URL)
                response.raise_for_status()
                data = response.json()
            except httpx.HTTPError as e:
                logger.error(f"Failed to fetch marketplace catalog: {e}")
                raise MarketplaceException(
                    f"Failed to fetch marketplace catalog: {e}",
                    error_code=ErrorCode.MARKETPLACE_FETCH_FAILED,
                )

        all_plugins: list[MarketplacePluginDict] = []
        for plugin in data.get("plugins", []):
            all_plugins.append(self._normalize_plugin(plugin))

        plugins = [
            p
            for p in all_plugins
            if not p["source"].startswith("external:")
            and not p.get("has_lsp_only", False)
        ]

        _catalog_cache = plugins
        _catalog_cached_at = datetime.now(timezone.utc)
        self._save_disk_cache(plugins)
        return plugins

    def _is_cache_valid(self) -> bool:
        global _catalog_cache, _catalog_cached_at
        if _catalog_cache is None or _catalog_cached_at is None:
            return False
        expiry = _catalog_cached_at + timedelta(seconds=CACHE_TTL_SECONDS)
        return datetime.now(timezone.utc) < expiry

    def _load_disk_cache(self) -> bool:
        global _catalog_cache, _catalog_cached_at
        try:
            if not self._cache_file.exists():
                return False
            stat = self._cache_file.stat()
            cache_age = datetime.now(timezone.utc) - datetime.fromtimestamp(
                stat.st_mtime, tz=timezone.utc
            )
            if cache_age.total_seconds() > CACHE_TTL_SECONDS:
                return False
            with open(self._cache_file, "r") as f:
                _catalog_cache = json.load(f)
            _catalog_cached_at = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
            return True
        except Exception as e:
            logger.warning(f"Failed to load disk cache: {e}")
            return False

    def _save_disk_cache(self, plugins: list[MarketplacePluginDict]) -> None:
        try:
            with open(self._cache_file, "w") as f:
                json.dump(plugins, f)
        except Exception as e:
            logger.warning(f"Failed to save disk cache: {e}")

    def _normalize_plugin(self, raw: dict[str, Any]) -> MarketplacePluginDict:
        author_raw = raw.get("author") or raw.get("owner")
        author: MarketplaceAuthorDict | None = None
        if isinstance(author_raw, str):
            author = {"name": author_raw}
        elif isinstance(author_raw, dict):
            author = cast(MarketplaceAuthorDict, author_raw)

        source_raw = raw.get("source", "")
        if isinstance(source_raw, dict):
            # external plugins have source as {"source": "url", "url": "..."} - prefix with "external:"
            source = f"external:{source_raw.get('url', '')}"
        else:
            source = source_raw

        has_lsp_only = bool(raw.get("lspServers")) and not any(
            [
                raw.get("agents"),
                raw.get("commands"),
                raw.get("skills"),
                raw.get("mcpServers"),
            ]
        )

        return {
            "name": raw.get("name", ""),
            "description": raw.get("description", ""),
            "category": raw.get("category", "other"),
            "source": source,
            "version": raw.get("version"),
            "author": author,
            "homepage": raw.get("homepage"),
            "has_lsp_only": has_lsp_only,
        }

    async def get_plugin_details(self, plugin_name: str) -> PluginDetailsDict:
        catalog = await self.fetch_catalog()

        plugin = next((p for p in catalog if p["name"] == plugin_name), None)
        if not plugin:
            raise MarketplaceException(
                f"Plugin '{plugin_name}' not found",
                error_code=ErrorCode.MARKETPLACE_PLUGIN_NOT_FOUND,
                status_code=404,
            )

        source = plugin.get("source", "")
        if source.startswith("external:"):
            return {
                "name": plugin["name"],
                "description": plugin.get("description", ""),
                "category": plugin.get("category", "other"),
                "source": source,
                "version": plugin.get("version"),
                "author": plugin.get("author"),
                "homepage": plugin.get("homepage"),
                "readme": None,
                "components": {
                    "agents": [],
                    "commands": [],
                    "skills": [],
                    "mcp_servers": [],
                },
            }

        source = _validate_source_path(source)
        readme = await self._fetch_readme(source)
        components = await self._discover_components(source)

        return {
            "name": plugin["name"],
            "description": plugin.get("description", ""),
            "category": plugin.get("category", "other"),
            "source": plugin.get("source", ""),
            "version": plugin.get("version"),
            "author": plugin.get("author"),
            "homepage": plugin.get("homepage"),
            "readme": readme,
            "components": components,
        }

    async def _fetch_readme(self, source: str) -> str | None:
        url = f"{REPO_RAW_BASE}/{source}/README.md"
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                response = await client.get(url)
                if response.status_code == 200:
                    return str(response.text)
            except httpx.HTTPError:
                pass
        return None

    async def _discover_components(self, source: str) -> PluginComponentsDict:
        components: PluginComponentsDict = {
            "agents": [],
            "commands": [],
            "skills": [],
            "mcp_servers": [],
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            agents = await self._list_directory(client, f"{source}/agents")
            components["agents"] = [
                f.replace(".md", "") for f in agents if f.endswith(".md")
            ]

            commands = await self._list_directory(client, f"{source}/commands")
            components["commands"] = [
                f.replace(".md", "") for f in commands if f.endswith(".md")
            ]

            skills_dirs = await self._list_directory(client, f"{source}/skills")
            components["skills"] = [
                d
                for d in skills_dirs
                if not d.startswith(".") and _validate_path_segment(d)
            ]

            mcp_servers = await self._fetch_mcp_config(client, source)
            components["mcp_servers"] = mcp_servers

        return components

    async def _list_directory(self, client: httpx.AsyncClient, path: str) -> list[str]:
        url = f"{GITHUB_API_BASE}/{path}"
        try:
            response = await client.get(
                url, headers={"Accept": "application/vnd.github.v3+json"}
            )
            if response.status_code != 200:
                return []
            data = response.json()
            if isinstance(data, list):
                return [
                    item["name"]
                    for item in data
                    if _validate_path_segment(item.get("name", ""))
                ]
        except httpx.HTTPError:
            pass
        return []

    async def _fetch_mcp_config(
        self, client: httpx.AsyncClient, source: str
    ) -> list[str]:
        url = f"{REPO_RAW_BASE}/{source}/.mcp.json"
        try:
            response = await client.get(url)
            if response.status_code != 200:
                return []
            data = response.json()
            if not isinstance(data, dict):
                return []
            servers = data.get("mcpServers") or data
            return [
                k
                for k in servers.keys()
                if _validate_path_segment(k) and isinstance(servers[k], dict)
            ]
        except (httpx.HTTPError, ValueError):
            pass
        return []

    async def download_agent(self, source: str, agent_name: str) -> bytes:
        source = _validate_source_path(source)
        agent_name = _validate_component_name(agent_name)
        return await self._download_file(f"{source}/agents/{agent_name}.md")

    async def download_command(self, source: str, command_name: str) -> bytes:
        source = _validate_source_path(source)
        command_name = _validate_component_name(command_name)
        return await self._download_file(f"{source}/commands/{command_name}.md")

    async def download_skill_as_zip(self, source: str, skill_name: str) -> bytes:
        source = _validate_source_path(source)
        skill_name = _validate_component_name(skill_name)

        skill_path = f"{source}/skills/{skill_name}"
        zip_buffer = io.BytesIO()

        async with httpx.AsyncClient(timeout=60.0) as client:
            files = await self._collect_files_recursive(client, skill_path, depth=0)

            if not files:
                raise MarketplaceException(
                    f"Skill '{skill_name}' has no files",
                    error_code=ErrorCode.MARKETPLACE_INSTALL_FAILED,
                )

            with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
                for file_path in files:
                    url = f"{REPO_RAW_BASE}/{file_path}"
                    try:
                        response = await client.get(url)
                        response.raise_for_status()
                        relative = file_path.replace(f"{skill_path}/", "")
                        zf.writestr(relative, response.content)
                    except httpx.HTTPError as e:
                        logger.warning(f"Failed to download {file_path}: {e}")

        zip_buffer.seek(0)
        return zip_buffer.read()

    async def _collect_files_recursive(
        self,
        client: httpx.AsyncClient,
        path: str,
        depth: int,
        total_count: list[int] | None = None,
    ) -> list[str]:
        # mutable list used to share file count state across recursive calls
        # (integers are immutable in Python so a list wrapper is needed)
        if total_count is None:
            total_count = [0]

        if depth > MAX_RECURSION_DEPTH:
            logger.warning(f"Max recursion depth reached for {path}")
            return []

        if total_count[0] >= MAX_SKILL_FILES:
            return []

        files: list[str] = []
        url = f"{GITHUB_API_BASE}/{path}"
        try:
            response = await client.get(
                url, headers={"Accept": "application/vnd.github.v3+json"}
            )
            if response.status_code != 200:
                return []
            data = response.json()
            if not isinstance(data, list):
                return []
            for item in data:
                if total_count[0] >= MAX_SKILL_FILES:
                    logger.warning(f"Max total file count ({MAX_SKILL_FILES}) reached")
                    break
                name = item.get("name", "")
                if not _validate_path_segment(name):
                    continue
                if item["type"] == "file":
                    files.append(item["path"])
                    total_count[0] += 1
                elif item["type"] == "dir":
                    sub_files = await self._collect_files_recursive(
                        client, item["path"], depth + 1, total_count
                    )
                    files.extend(sub_files)
        except httpx.HTTPError:
            pass
        return files

    async def download_mcp_config(self, source: str) -> dict[str, Any] | None:
        source = _validate_source_path(source)
        url = f"{REPO_RAW_BASE}/{source}/.mcp.json"
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                response = await client.get(url)
                if response.status_code == 200:
                    return cast(dict[str, Any], response.json())
            except (httpx.HTTPError, ValueError):
                pass
        return None

    async def _download_file(self, path: str) -> bytes:
        url = f"{REPO_RAW_BASE}/{path}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(url)
                response.raise_for_status()
                return bytes(response.content)
            except httpx.HTTPError as e:
                raise MarketplaceException(
                    f"Failed to download {path}: {e}",
                    error_code=ErrorCode.MARKETPLACE_INSTALL_FAILED,
                )
