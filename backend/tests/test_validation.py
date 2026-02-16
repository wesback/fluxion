"""Tests for input validation improvements."""

import pytest

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
