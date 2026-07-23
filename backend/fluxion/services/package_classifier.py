"""Central package classification used by APIs, filters, and webhooks."""

from dataclasses import dataclass
from enum import StrEnum

from sqlalchemy import or_


class PackageClass(StrEnum):
    """Canonical package categories."""

    KERNEL = "kernel"
    PACKAGE = "package"


KERNEL_PREFIXES = ("linux-image", "linux-headers", "linux-modules")


@dataclass(frozen=True, slots=True)
class PackageClassification:
    """Classification result for a package name."""

    package_name: str
    classification: PackageClass

    @property
    def is_kernel(self) -> bool:
        return self.classification is PackageClass.KERNEL


def classify_package(package_name: str) -> PackageClassification:
    """Classify supported kernel package families consistently."""
    normalized = package_name.strip().lower()
    is_kernel = any(
        normalized == prefix or normalized.startswith(f"{prefix}-") for prefix in KERNEL_PREFIXES
    )
    return PackageClassification(
        package_name=package_name,
        classification=PackageClass.KERNEL if is_kernel else PackageClass.PACKAGE,
    )


def is_kernel_package(package_name: str) -> bool:
    """Return whether a package belongs to a supported kernel family."""
    return classify_package(package_name).is_kernel


def kernel_predicate(column):
    """Build the SQL predicate matching the same classifier boundaries."""
    return or_(*(column == prefix for prefix in KERNEL_PREFIXES), *(
        column.like(f"{prefix}-%") for prefix in KERNEL_PREFIXES
    ))
