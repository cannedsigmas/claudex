from typing import Literal

from pydantic import BaseModel, Field


class McpCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    description: str = Field(..., min_length=1, max_length=500)
    command_type: Literal["npx", "bunx", "uvx", "http"]
    package: str | None = None
    url: str | None = None
    env_vars: dict[str, str] | None = None
    args: list[str] | None = None
    enabled: bool = True


class McpUpdateRequest(BaseModel):
    description: str | None = Field(None, min_length=1, max_length=500)
    command_type: Literal["npx", "bunx", "uvx", "http"] | None = None
    package: str | None = None
    url: str | None = None
    env_vars: dict[str, str] | None = None
    args: list[str] | None = None
    enabled: bool | None = None


class McpResponse(BaseModel):
    name: str
    description: str
    command_type: Literal["npx", "bunx", "uvx", "http"]
    package: str | None = None
    url: str | None = None
    env_vars: dict[str, str] | None = None
    args: list[str] | None = None
    enabled: bool = True


class McpDeleteResponse(BaseModel):
    status: Literal["deleted", "not_found"]
