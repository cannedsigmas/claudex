from pydantic import BaseModel, Field


class MarketplaceAuthor(BaseModel):
    name: str
    email: str | None = None
    url: str | None = None


class MarketplacePlugin(BaseModel):
    name: str = Field(..., description="Plugin identifier")
    description: str = Field(..., description="What the plugin does")
    category: str = Field(..., description="Plugin category")
    source: str = Field(..., description="Source path in repository")
    version: str | None = Field(None, description="Plugin version")
    author: MarketplaceAuthor | None = None
    homepage: str | None = None


class PluginComponents(BaseModel):
    agents: list[str] = Field(default_factory=list)
    commands: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    mcp_servers: list[str] = Field(default_factory=list)


class PluginDetails(MarketplacePlugin):
    readme: str | None = None
    components: PluginComponents = Field(default_factory=PluginComponents)


class InstallComponentRequest(BaseModel):
    plugin_name: str = Field(..., description="Name of the plugin to install from")
    components: list[str] = Field(
        ...,
        description="Components to install (e.g., 'agent:name', 'command:name', 'skill:name', 'mcp:name')",
    )


class InstallComponentResult(BaseModel):
    component: str
    success: bool
    error: str | None = None


class InstallResponse(BaseModel):
    plugin_name: str
    version: str | None
    installed: list[str]
    failed: list[InstallComponentResult]


class InstalledPlugin(BaseModel):
    name: str
    version: str | None = None
    installed_at: str
    components: list[str]


class UninstallComponentsRequest(BaseModel):
    plugin_name: str = Field(..., description="Name of the plugin to uninstall from")
    components: list[str] = Field(
        ...,
        description="Components to uninstall (e.g., 'agent:name', 'command:name')",
    )


class UninstallResponse(BaseModel):
    plugin_name: str
    uninstalled: list[str]
    failed: list[InstallComponentResult]
