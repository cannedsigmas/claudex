from __future__ import annotations

import pytest
from httpx import AsyncClient

# Real plugin from GitHub marketplace for integration tests
TEST_PLUGIN = "pr-review-toolkit"


class TestGetCatalog:
    async def test_get_catalog_success(
        self,
        marketplace_client: AsyncClient,
    ) -> None:
        response = await marketplace_client.get("/api/v1/marketplace/catalog")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0

        plugin_names = [p["name"] for p in data]
        assert TEST_PLUGIN in plugin_names

    async def test_get_catalog_force_refresh(
        self,
        marketplace_client: AsyncClient,
    ) -> None:
        response = await marketplace_client.get(
            "/api/v1/marketplace/catalog",
            params={"force_refresh": True},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0

    async def test_get_catalog_returns_correct_schema(
        self,
        marketplace_client: AsyncClient,
    ) -> None:
        response = await marketplace_client.get("/api/v1/marketplace/catalog")

        assert response.status_code == 200
        data = response.json()

        for plugin in data:
            assert "name" in plugin
            assert "description" in plugin
            assert "category" in plugin
            assert "source" in plugin


class TestGetPluginDetails:
    async def test_get_plugin_details_success(
        self,
        marketplace_client: AsyncClient,
    ) -> None:
        response = await marketplace_client.get(
            f"/api/v1/marketplace/catalog/{TEST_PLUGIN}"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == TEST_PLUGIN
        assert "description" in data
        assert "components" in data

    async def test_get_plugin_details_not_found(
        self,
        marketplace_client: AsyncClient,
    ) -> None:
        response = await marketplace_client.get(
            "/api/v1/marketplace/catalog/nonexistent-plugin-xyz123"
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    async def test_get_plugin_details_includes_components(
        self,
        marketplace_client: AsyncClient,
    ) -> None:
        response = await marketplace_client.get(
            f"/api/v1/marketplace/catalog/{TEST_PLUGIN}"
        )

        assert response.status_code == 200
        components = response.json()["components"]
        assert "agents" in components
        assert "commands" in components
        assert "skills" in components
        assert "mcp_servers" in components


class TestInstallComponents:
    @pytest.fixture
    async def plugin_with_agent(
        self, marketplace_client: AsyncClient
    ) -> tuple[str, str]:
        response = await marketplace_client.get("/api/v1/marketplace/catalog")
        plugins = response.json()

        for plugin in plugins:
            details_response = await marketplace_client.get(
                f"/api/v1/marketplace/catalog/{plugin['name']}"
            )
            if details_response.status_code == 200:
                components = details_response.json().get("components", {})
                agents = components.get("agents", [])
                if agents:
                    return plugin["name"], agents[0]

        pytest.skip("No plugin with agents found in marketplace")

    @pytest.fixture
    async def plugin_with_command(
        self, marketplace_client: AsyncClient
    ) -> tuple[str, str]:
        response = await marketplace_client.get("/api/v1/marketplace/catalog")
        plugins = response.json()

        for plugin in plugins:
            details_response = await marketplace_client.get(
                f"/api/v1/marketplace/catalog/{plugin['name']}"
            )
            if details_response.status_code == 200:
                components = details_response.json().get("components", {})
                commands = components.get("commands", [])
                if commands:
                    return plugin["name"], commands[0]

        pytest.skip("No plugin with commands found in marketplace")

    async def test_install_agent_success(
        self,
        marketplace_client: AsyncClient,
        marketplace_auth_headers: dict[str, str],
        plugin_with_agent: tuple[str, str],
    ) -> None:
        plugin_name, agent_name = plugin_with_agent

        response = await marketplace_client.post(
            "/api/v1/marketplace/install",
            json={
                "plugin_name": plugin_name,
                "components": [f"agent:{agent_name}"],
            },
            headers=marketplace_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["plugin_name"] == plugin_name
        assert f"agent:{agent_name}" in data["installed"]
        assert data["failed"] == []

    async def test_install_command_success(
        self,
        marketplace_client: AsyncClient,
        marketplace_auth_headers: dict[str, str],
        plugin_with_command: tuple[str, str],
    ) -> None:
        plugin_name, command_name = plugin_with_command

        response = await marketplace_client.post(
            "/api/v1/marketplace/install",
            json={
                "plugin_name": plugin_name,
                "components": [f"command:{command_name}"],
            },
            headers=marketplace_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert f"command:{command_name}" in data["installed"]
        assert data["failed"] == []

    async def test_install_unauthorized(
        self,
        marketplace_client: AsyncClient,
    ) -> None:
        response = await marketplace_client.post(
            "/api/v1/marketplace/install",
            json={
                "plugin_name": TEST_PLUGIN,
                "components": ["agent:test"],
            },
        )

        assert response.status_code == 401

    async def test_install_plugin_not_found(
        self,
        marketplace_client: AsyncClient,
        marketplace_auth_headers: dict[str, str],
    ) -> None:
        response = await marketplace_client.post(
            "/api/v1/marketplace/install",
            json={
                "plugin_name": "nonexistent-plugin-xyz123",
                "components": ["agent:test"],
            },
            headers=marketplace_auth_headers,
        )

        assert response.status_code == 404

    async def test_install_invalid_component_format(
        self,
        marketplace_client: AsyncClient,
        marketplace_auth_headers: dict[str, str],
    ) -> None:
        response = await marketplace_client.post(
            "/api/v1/marketplace/install",
            json={
                "plugin_name": TEST_PLUGIN,
                "components": ["invalid-format"],
            },
            headers=marketplace_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["installed"] == []
        assert len(data["failed"]) == 1
        assert data["failed"][0]["component"] == "invalid-format"
        assert "format" in data["failed"][0]["error"].lower()

    async def test_install_unknown_component_type(
        self,
        marketplace_client: AsyncClient,
        marketplace_auth_headers: dict[str, str],
    ) -> None:
        response = await marketplace_client.post(
            "/api/v1/marketplace/install",
            json={
                "plugin_name": TEST_PLUGIN,
                "components": ["unknown:test"],
            },
            headers=marketplace_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["installed"] == []
        assert len(data["failed"]) == 1
        assert "unknown" in data["failed"][0]["error"].lower()

    async def test_install_component_not_in_plugin(
        self,
        marketplace_client: AsyncClient,
        marketplace_auth_headers: dict[str, str],
    ) -> None:
        response = await marketplace_client.post(
            "/api/v1/marketplace/install",
            json={
                "plugin_name": TEST_PLUGIN,
                "components": ["agent:nonexistent-agent-xyz123"],
            },
            headers=marketplace_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["installed"] == []
        assert len(data["failed"]) == 1
        assert "not found" in data["failed"][0]["error"].lower()


class TestGetInstalledPlugins:
    async def test_get_installed_empty(
        self,
        marketplace_client: AsyncClient,
        marketplace_auth_headers: dict[str, str],
    ) -> None:
        response = await marketplace_client.get(
            "/api/v1/marketplace/installed",
            headers=marketplace_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0

    async def test_get_installed_unauthorized(
        self,
        marketplace_client: AsyncClient,
    ) -> None:
        response = await marketplace_client.get("/api/v1/marketplace/installed")

        assert response.status_code == 401


class TestUninstallComponents:
    async def test_uninstall_unauthorized(
        self,
        marketplace_client: AsyncClient,
    ) -> None:
        response = await marketplace_client.post(
            "/api/v1/marketplace/uninstall",
            json={
                "plugin_name": TEST_PLUGIN,
                "components": ["agent:test"],
            },
        )

        assert response.status_code == 401

    async def test_uninstall_component_not_found(
        self,
        marketplace_client: AsyncClient,
        marketplace_auth_headers: dict[str, str],
    ) -> None:
        response = await marketplace_client.post(
            "/api/v1/marketplace/uninstall",
            json={
                "plugin_name": TEST_PLUGIN,
                "components": ["agent:never-installed"],
            },
            headers=marketplace_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["uninstalled"] == []
        assert len(data["failed"]) == 1
        assert "not found" in data["failed"][0]["error"].lower()

    async def test_uninstall_invalid_format(
        self,
        marketplace_client: AsyncClient,
        marketplace_auth_headers: dict[str, str],
    ) -> None:
        response = await marketplace_client.post(
            "/api/v1/marketplace/uninstall",
            json={
                "plugin_name": TEST_PLUGIN,
                "components": ["invalid-format"],
            },
            headers=marketplace_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["uninstalled"] == []
        assert len(data["failed"]) == 1
        assert "format" in data["failed"][0]["error"].lower()

    async def test_uninstall_unknown_type(
        self,
        marketplace_client: AsyncClient,
        marketplace_auth_headers: dict[str, str],
    ) -> None:
        response = await marketplace_client.post(
            "/api/v1/marketplace/uninstall",
            json={
                "plugin_name": TEST_PLUGIN,
                "components": ["unknown:test"],
            },
            headers=marketplace_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["uninstalled"] == []
        assert len(data["failed"]) == 1
        assert "unknown" in data["failed"][0]["error"].lower()


class TestInstallUninstallFlow:
    @pytest.fixture
    async def plugin_with_agent(
        self, marketplace_client: AsyncClient
    ) -> tuple[str, str]:
        response = await marketplace_client.get("/api/v1/marketplace/catalog")
        plugins = response.json()

        for plugin in plugins:
            details_response = await marketplace_client.get(
                f"/api/v1/marketplace/catalog/{plugin['name']}"
            )
            if details_response.status_code == 200:
                components = details_response.json().get("components", {})
                agents = components.get("agents", [])
                if agents:
                    return plugin["name"], agents[0]

        pytest.skip("No plugin with agents found in marketplace")

    async def test_install_then_uninstall(
        self,
        marketplace_client: AsyncClient,
        marketplace_auth_headers: dict[str, str],
        plugin_with_agent: tuple[str, str],
    ) -> None:
        plugin_name, agent_name = plugin_with_agent
        component_id = f"agent:{agent_name}"

        install_response = await marketplace_client.post(
            "/api/v1/marketplace/install",
            json={
                "plugin_name": plugin_name,
                "components": [component_id],
            },
            headers=marketplace_auth_headers,
        )
        assert install_response.status_code == 200
        assert component_id in install_response.json()["installed"]

        installed_response = await marketplace_client.get(
            "/api/v1/marketplace/installed",
            headers=marketplace_auth_headers,
        )
        assert installed_response.status_code == 200
        assert len(installed_response.json()) == 1
        assert installed_response.json()[0]["name"] == plugin_name

        uninstall_response = await marketplace_client.post(
            "/api/v1/marketplace/uninstall",
            json={
                "plugin_name": plugin_name,
                "components": [component_id],
            },
            headers=marketplace_auth_headers,
        )
        assert uninstall_response.status_code == 200
        assert component_id in uninstall_response.json()["uninstalled"]

        final_installed = await marketplace_client.get(
            "/api/v1/marketplace/installed",
            headers=marketplace_auth_headers,
        )
        assert final_installed.status_code == 200
        assert len(final_installed.json()) == 0
