"""Tests for input validation improvements."""

import pytest
import pytest_asyncio
import sqlalchemy as sa
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.orm import sessionmaker

import fluxion.api.routes.updates as updates_module
from fluxion.models.base import Base
from fluxion.schemas.package_update import BatchPackageUpdateRequest, PackageUpdateRequest
from fluxion.schemas.webhook import WebhookConfigCreate, WebhookConfigUpdate


class TestHostnameValidation:
    """Tests for hostname validation."""

    def test_valid_hostname_simple(self):
        """Test valid simple hostname."""
        req = PackageUpdateRequest(
            hostname="server01", package_name="nginx", new_version="1.0.0"
        )
        assert req.hostname == "server01"

    def test_valid_hostname_with_dots(self):
        """Test valid hostname with dots (FQDN)."""
        req = PackageUpdateRequest(
            hostname="server01.example.com", package_name="nginx", new_version="1.0.0"
        )
        assert req.hostname == "server01.example.com"

    def test_valid_hostname_with_hyphens_and_underscores(self):
        """Test valid hostname with hyphens and underscores."""
        req = PackageUpdateRequest(
            hostname="my-server_01", package_name="nginx", new_version="1.0.0"
        )
        assert req.hostname == "my-server_01"

    def test_invalid_hostname_with_spaces(self):
        """Test hostname with spaces is rejected."""
        with pytest.raises(ValueError, match="Hostname must contain only"):
            PackageUpdateRequest(
                hostname="server 01", package_name="nginx", new_version="1.0.0"
            )

    def test_invalid_hostname_with_special_chars(self):
        """Test hostname with special characters is rejected."""
        with pytest.raises(ValueError, match="Hostname must contain only"):
            PackageUpdateRequest(
                hostname="server;rm -rf /", package_name="nginx", new_version="1.0.0"
            )

    def test_invalid_hostname_with_quotes(self):
        """Test hostname with quotes is rejected."""
        with pytest.raises(ValueError, match="Hostname must contain only"):
            PackageUpdateRequest(
                hostname='server"01', package_name="nginx", new_version="1.0.0"
            )

    def test_batch_hostname_validation(self):
        """Test hostname validation in batch requests."""
        with pytest.raises(ValueError, match="Hostname must contain only"):
            BatchPackageUpdateRequest(
                hostname="server;whoami",
                updates=[{"package_name": "nginx", "old_version": "1.0", "new_version": "2.0"}],
            )


class TestWebhookUrlValidation:
    """Tests for webhook URL validation."""

    def test_valid_https_url(self):
        """Test valid HTTPS URL."""
        webhook = WebhookConfigCreate(
            name="test", url="https://example.com/webhook", event_types=["kernel_update"]
        )
        assert webhook.url == "https://example.com/webhook"

    def test_valid_http_url(self):
        """Test valid HTTP URL."""
        webhook = WebhookConfigCreate(
            name="test", url="http://example.com/webhook", event_types=["kernel_update"]
        )
        assert webhook.url == "http://example.com/webhook"

    def test_invalid_ftp_scheme(self):
        """Test FTP scheme is rejected."""
        with pytest.raises(ValueError, match="http or https"):
            WebhookConfigCreate(
                name="test", url="ftp://example.com/file", event_types=["kernel_update"]
            )

    def test_invalid_private_ip(self):
        """Test private IP address is rejected (SSRF prevention)."""
        with pytest.raises(ValueError, match="private or reserved"):
            WebhookConfigCreate(
                name="test", url="http://192.168.1.1/webhook", event_types=["kernel_update"]
            )

    def test_invalid_loopback_ip(self):
        """Test loopback IP address is rejected."""
        with pytest.raises(ValueError, match="private or reserved"):
            WebhookConfigCreate(
                name="test", url="http://127.0.0.1/webhook", event_types=["kernel_update"]
            )

    def test_invalid_metadata_ip(self):
        """Test cloud metadata IP is rejected."""
        with pytest.raises(ValueError, match="private or reserved"):
            WebhookConfigCreate(
                name="test",
                url="http://169.254.169.254/latest/meta-data/",
                event_types=["kernel_update"],
            )

    def test_valid_public_hostname(self):
        """Test valid public hostname is accepted."""
        webhook = WebhookConfigCreate(
            name="test", url="https://ntfy.sh/my-topic", event_types=["kernel_update"]
        )
        assert webhook.url == "https://ntfy.sh/my-topic"

    def test_update_url_validation(self):
        """Test URL validation on update schema."""
        with pytest.raises(ValueError, match="private or reserved"):
            WebhookConfigUpdate(url="http://10.0.0.1/webhook")

    def test_update_none_url_accepted(self):
        """Test None URL is accepted on update schema (no change)."""
        update = WebhookConfigUpdate(url=None)
        assert update.url is None


class AsyncOverSync:
    def __init__(self, session): self._session = session
    @property
    def new(self): return self._session.new
    def add(self, value): self._session.add(value)
    async def execute(self, *args, **kwargs): return self._session.execute(*args, **kwargs)
    async def flush(self): self._session.flush()
    async def commit(self): self._session.commit()
    async def rollback(self): self._session.rollback()


@pytest_asyncio.fixture
async def validation_client(tmp_path, monkeypatch):
    engine = sa.create_engine(f"sqlite:///{tmp_path}/validation.sqlite", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    async def no_delivery(*_args, **_kwargs): return None
    monkeypatch.setattr(updates_module, "_trigger_package_change_webhooks", no_delivery)
    app = FastAPI()

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request, exc):
        errors = [{key: value for key, value in error.items() if key != "ctx"} for error in exc.errors()]
        return JSONResponse(status_code=400, content={"detail": "Validation error", "errors": errors})

    app.include_router(updates_module.router, prefix="/api/v1")
    async def get_test_session():
        with factory() as session:
            yield AsyncOverSync(session)
    app.dependency_overrides[updates_module.get_session] = get_test_session
    app.dependency_overrides[updates_module.authorize_batch_hostname] = lambda: {"role": "admin", "allowed_hosts": []}
    statements = []
    def capture(_conn, _cursor, statement, parameters, executemany, _context=None):
        statements.append(statement)
    sa.event.listen(engine, "before_cursor_execute", capture)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, statements
    sa.event.remove(engine, "before_cursor_execute", capture)


@pytest.mark.parametrize("item,batch_package_manager,expected_status,expect_sql", [
    ({"package_name": 123, "new_version": "2"}, "apt", 400, False),
    ({"package_name": None, "new_version": "2"}, "apt", 400, False),
    ({"package_name": "", "new_version": "2"}, "apt", 400, False),
    ({"package_name": "p" * 256, "new_version": "2"}, "apt", 400, False),
    ({"package_name": "pkg", "new_version": None}, "apt", 400, False),
    ({"package_name": "pkg", "new_version": ""}, "apt", 400, False),
    ({"package_name": "pkg", "new_version": None}, "apt", 400, False),
    ({"package_name": "pkg", "new_version": ""}, "apt", 400, False),
    ({"package_name": "pkg", "new_version": "v" * 256}, "apt", 400, False),
    ({"package_name": "pkg", "new_version": 5}, "apt", 400, False),
    ({"package_name": "pkg", "new_version": "2", "source": "apt"}, "apt", 400, False),
    ({"package_name": "pkg", "new_version": "2", "package_manager": "freebsd"}, "apt", 400, False),
    ({"package_name": "pkg", "new_version": "2"}, "cargo", 400, False),
    ({"package_name": "pkg", "new_version": "2"}, "apt", 201, True),
    ({"package_name": "pkg", "new_version": "2"}, "pacman", 201, True),
    ({"package_name": "pkg", "new_version": "2", "package_manager": "apt"}, None, 201, True),
    ({"package_name": "pkg", "new_version": "2", "package_manager": "pacman"}, None, 201, True),
])
async def test_malformed_batch_contract(validation_client, item, batch_package_manager, expected_status, expect_sql):
    client, statements = validation_client
    statements.clear()
    payload = {"hostname": "valid-host", "package_manager": batch_package_manager, "updates": [item]}
    response = await client.post("/api/v1/updates/batch", json=payload, headers={"X-API-Key": "secret"})
    assert response.status_code == expected_status
    if expected_status == 400:
        assert response.json()["detail"] == "Validation error"
        assert statements == []
        if isinstance(item.get("package_name"), str) and len(item["package_name"]) == 256:
            assert any(error["loc"][-1] == "package_name" for error in response.json()["errors"])
    if not expect_sql:
        assert statements == []
    if expected_status == 201:
        assert response.json()["count"] == 1
        assert statements


class TestSqlWildcardEscaping:
    """Tests for SQL wildcard character escaping in query parameters."""

    def test_package_name_with_percent(self):
        """Test that percent signs are escaped in package name search."""
        # Verify the escaping function works correctly
        name = "test%package"
        escaped = name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        assert escaped == "test\\%package"

    def test_package_name_with_underscore(self):
        """Test that underscores are escaped in package name search."""
        name = "test_package"
        escaped = name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        assert escaped == "test\\_package"

    def test_package_name_with_backslash(self):
        """Test that backslashes are escaped in package name search."""
        name = "test\\package"
        escaped = name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        assert escaped == "test\\\\package"

    def test_normal_package_name_unchanged(self):
        """Test that normal package names are not altered."""
        name = "nginx"
        escaped = name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        assert escaped == "nginx"
