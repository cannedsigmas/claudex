import logging
import os
import re
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Generic, NoReturn, TypeVar

from fastapi import UploadFile

from app.constants import (
    MAX_RESOURCE_NAME_LENGTH,
    MAX_RESOURCE_SIZE_BYTES,
    MAX_RESOURCES_PER_USER,
    MIN_RESOURCE_NAME_LENGTH,
)

from app.core.config import get_settings
from app.models.types import (
    BaseResourceDict,
    EnabledResourceInfo,
    ParsedResourceResult,
    YamlMetadata,
)
from app.services.exceptions import ServiceException
from app.utils.yaml_parser import parse_yaml_frontmatter

T = TypeVar("T", bound=BaseResourceDict)

settings = get_settings()
logger = logging.getLogger(__name__)

AVAILABLE_TOOLS = [
    "Agent",
    "Bash",
    "BashOutput",
    "Edit",
    "ExitPlanMode",
    "Glob",
    "Grep",
    "KillShell",
    "LS",
    "MultiEdit",
    "NotebookEdit",
    "NotebookRead",
    "Read",
    "Skill",
    "SlashCommand",
    "TodoRead",
    "TodoWrite",
    "WebFetch",
    "WebSearch",
    "Write",
]
VALID_COMMAND_MODELS = [
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-5-20251101",
    "claude-haiku-4-5-20251001",
]


class BaseMarkdownResourceService(ABC, Generic[T]):
    resource_type: str = ""
    max_items_per_user: int = MAX_RESOURCES_PER_USER
    max_size_bytes: int = MAX_RESOURCE_SIZE_BYTES
    exception_class: type[ServiceException] = ServiceException
    valid_models: list[str] = VALID_COMMAND_MODELS
    requires_name_in_frontmatter: bool = True

    def __init__(self) -> None:
        self.storage_path = Path(settings.STORAGE_PATH)
        self.base_path = self.storage_path / self._get_storage_folder()
        self.base_path.mkdir(parents=True, exist_ok=True)

    @abstractmethod
    def _get_storage_folder(self) -> str:
        pass

    @abstractmethod
    def _build_response(self, name: str, metadata: YamlMetadata, content: str) -> T:
        pass

    def _get_user_path(self, user_id: str) -> Path:
        path = self.base_path / str(user_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _get_resource_path(self, user_id: str, name: str) -> Path:
        return self._get_user_path(user_id) / f"{name}.md"

    def _raise(self, message: str) -> NoReturn:
        raise self.exception_class(message)

    def sanitize_name(self, name: str) -> str:
        name = name.lower().replace(" ", "-")
        name = re.sub(r"[^a-z0-9\-_]", "", name)
        name = re.sub(r"-+", "-", name)
        name = name.strip("-")

        if not name or len(name) < MIN_RESOURCE_NAME_LENGTH:
            self._raise(
                f"{self.resource_type} name must be at least "
                f"{MIN_RESOURCE_NAME_LENGTH} characters after sanitization"
            )

        if len(name) > MAX_RESOURCE_NAME_LENGTH:
            self._raise(
                f"{self.resource_type} name too long (max {MAX_RESOURCE_NAME_LENGTH} characters)"
            )

        return name

    def _parse_frontmatter(self, content: str) -> ParsedResourceResult:
        try:
            parsed = parse_yaml_frontmatter(content)
        except ValueError as e:
            self._raise(str(e))

        metadata = parsed["metadata"]

        if "description" not in metadata:
            self._raise("YAML frontmatter must include 'description' field")
        if not isinstance(metadata["description"], str):
            self._raise("YAML frontmatter 'description' must be a string")

        return {
            "metadata": metadata,
            "content": content,
            "markdown_content": parsed["markdown_content"],
        }

    def _validate_allowed_tools(self, allowed_tools: list[str] | None) -> None:
        if allowed_tools is None:
            return

        if not isinstance(allowed_tools, list):
            self._raise("allowed_tools must be a list")

        invalid_tools = [tool for tool in allowed_tools if tool not in AVAILABLE_TOOLS]
        if invalid_tools:
            self._raise(
                f"Invalid tools in allowed_tools: {', '.join(invalid_tools)}. "
                f"Valid tools are: {', '.join(AVAILABLE_TOOLS)}"
            )

    def _validate_model(self, model: str | None) -> None:
        if model is None:
            return

        if model not in self.valid_models:
            self._raise(
                f"Invalid model '{model}'. Valid models are: {', '.join(self.valid_models)}"
            )

    @abstractmethod
    def _validate_additional_fields(self, metadata: YamlMetadata) -> None:
        pass

    def _validate_markdown_file(self, content: str) -> ParsedResourceResult:
        if len(content) > self.max_size_bytes:
            self._raise(
                f"{self.resource_type} file too large (max {self.max_size_bytes / 1024}KB)"
            )

        try:
            content.encode("utf-8")
        except UnicodeEncodeError:
            self._raise(f"{self.resource_type} file must be valid UTF-8")

        parsed = self._parse_frontmatter(content)
        metadata = parsed["metadata"]

        self._validate_allowed_tools(metadata.get("allowed_tools"))
        self._validate_model(metadata.get("model"))
        self._validate_additional_fields(metadata)

        return parsed

    def _get_name_from_filename(self, filename: str) -> str:
        name = filename.rsplit(".", 1)[0] if "." in filename else filename
        return self.sanitize_name(name)

    def _get_name_from_metadata(
        self, metadata: YamlMetadata, fallback: str | None = None
    ) -> str:
        if "name" in metadata:
            name = metadata["name"]
            if not isinstance(name, str):
                self._raise("YAML frontmatter 'name' must be a string")
            return self.sanitize_name(name)
        if fallback:
            return self.sanitize_name(fallback)
        self._raise("YAML frontmatter must include 'name' field")

    async def upload(
        self,
        user_id: str,
        file: UploadFile,
        current_items: list[T],
    ) -> T:
        if len(current_items) >= self.max_items_per_user:
            self._raise(
                f"Maximum {self.max_items_per_user} {self.resource_type}s per user"
            )

        if not file.filename or not file.filename.endswith(".md"):
            self._raise("File must be a .md (markdown) file")

        contents = await file.read()

        try:
            content_str = contents.decode("utf-8")
        except UnicodeDecodeError:
            self._raise(f"{self.resource_type} file must be valid UTF-8")

        parsed = self._validate_markdown_file(content_str)
        metadata = parsed["metadata"]

        sanitized_name = self._get_name_from_filename(file.filename)

        if any(c.get("name") == sanitized_name for c in current_items):
            self._raise(f"{self.resource_type} '{sanitized_name}' already exists")

        resource_path = self._get_resource_path(user_id, sanitized_name)

        with open(resource_path, "w", encoding="utf-8") as f:
            f.write(content_str)

        logger.info(
            f"Stored {self.resource_type}: {sanitized_name}, size={len(contents)} bytes"
        )

        return self._build_response(sanitized_name, metadata, content_str)

    async def delete(self, user_id: str, name: str) -> None:
        resource_path = self._get_resource_path(user_id, name)
        if resource_path.exists():
            os.remove(resource_path)

    async def update(
        self,
        user_id: str,
        current_name: str,
        content: str,
        current_items: list[T],
    ) -> T:
        if len(content) > self.max_size_bytes:
            self._raise(
                f"{self.resource_type} file too large (max {self.max_size_bytes / 1024}KB)"
            )

        try:
            content.encode("utf-8")
        except UnicodeEncodeError:
            self._raise(f"{self.resource_type} file must be valid UTF-8")

        parsed = self._validate_markdown_file(content)
        metadata = parsed["metadata"]

        new_sanitized_name = self._get_name_from_metadata(metadata, current_name)

        if new_sanitized_name != current_name:
            if any(
                c.get("name") == new_sanitized_name
                for c in current_items
                if c.get("name") != current_name
            ):
                self._raise(
                    f"{self.resource_type} '{new_sanitized_name}' already exists"
                )

            old_path = self._get_resource_path(user_id, current_name)
            if old_path.exists():
                os.remove(old_path)

            new_path = self._get_resource_path(user_id, new_sanitized_name)
        else:
            new_path = self._get_resource_path(user_id, current_name)

        with open(new_path, "w", encoding="utf-8") as f:
            f.write(content)

        logger.info(
            f"Updated {self.resource_type}: {current_name} -> {new_sanitized_name}, "
            f"size={len(content)} bytes"
        )

        return self._build_response(new_sanitized_name, metadata, content)

    def get_enabled(
        self, user_id: str, custom_items: list[T]
    ) -> list[EnabledResourceInfo]:
        if not custom_items:
            return []

        enabled: list[EnabledResourceInfo] = []
        for item in custom_items:
            if item.get("enabled", True):
                resource_path = self._get_resource_path(user_id, str(item["name"]))
                if resource_path.exists() and resource_path.is_file():
                    enabled.append(
                        {"name": str(item["name"]), "path": str(resource_path)}
                    )
        return enabled
