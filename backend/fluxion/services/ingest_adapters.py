"""Contract-ready normalizers for supported package manager payloads."""

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True, slots=True)
class NormalizedUpdate:
    """Normalized package update independent of distro tooling."""

    package_name: str
    old_version: str | None
    new_version: str
    is_security: bool = False


@dataclass(frozen=True, slots=True)
class NormalizedIngest:
    """Normalized server-side ingest envelope."""

    hostname: str
    os_info: str | None
    package_manager: str
    updates: list[NormalizedUpdate]


class IngestAdapter(Protocol):
    """Adapter contract for a package manager's webhook shape."""

    package_manager: str

    def normalize_update(self, raw: dict[str, Any]) -> NormalizedUpdate:
        """Normalize one package update."""

    def normalize(self, payload: dict[str, Any]) -> NormalizedIngest:
        """Normalize a complete ingest payload."""


class BaseIngestAdapter:
    """Shared adapter implementation for package-manager payloads."""

    package_manager = "unknown"
    update_keys = ("updates", "packages")

    def normalize_update(self, raw: dict[str, Any]) -> NormalizedUpdate:
        package_name = raw.get("package_name") or raw.get("name") or raw.get("package")
        new_version = raw.get("new_version") or raw.get("new") or raw.get("version")
        if not package_name or not new_version:
            raise ValueError("update requires package name and new version")
        return NormalizedUpdate(
            package_name=str(package_name),
            old_version=raw.get("old_version") or raw.get("old"),
            new_version=str(new_version),
            is_security=bool(raw.get("is_security") or raw.get("security")),
        )

    def normalize(self, payload: dict[str, Any]) -> NormalizedIngest:
        raw_updates: list[dict[str, Any]] = []
        for key in self.update_keys:
            candidate = payload.get(key)
            if candidate:
                raw_updates = candidate
                break
        return NormalizedIngest(
            hostname=str(payload["hostname"]),
            os_info=payload.get("os_info"),
            package_manager=self.package_manager,
            updates=[self.normalize_update(item) for item in raw_updates],
        )


class DnfIngestAdapter(BaseIngestAdapter):
    """Normalize dnf/yum-compatible update payloads."""

    package_manager = "dnf"


class YumIngestAdapter(DnfIngestAdapter):
    """Normalize yum payloads using the dnf contract."""

    package_manager = "yum"


class ApkIngestAdapter(BaseIngestAdapter):
    """Normalize apk update payloads."""

    package_manager = "apk"


class ZypperIngestAdapter(BaseIngestAdapter):
    """Normalize zypper update payloads."""

    package_manager = "zypper"


ADAPTERS: dict[str, type[BaseIngestAdapter]] = {
    "dnf": DnfIngestAdapter,
    "yum": YumIngestAdapter,
    "apk": ApkIngestAdapter,
    "zypper": ZypperIngestAdapter,
}


def normalize_ingest_payload(
    payload: dict[str, Any], adapter: IngestAdapter
) -> NormalizedIngest:
    """Normalize a supported package-manager payload."""
    return adapter.normalize(payload)


def adapter_for(package_manager: str | None) -> BaseIngestAdapter | None:
    """Return an adapter for an explicit package manager, if supported."""
    if not package_manager:
        return None
    adapter_type = ADAPTERS.get(package_manager.strip().lower())
    return adapter_type() if adapter_type else None
