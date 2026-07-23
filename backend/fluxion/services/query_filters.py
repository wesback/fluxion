"""Shared SQL predicates for package update queries."""

from fluxion.models import Host, PackageUpdate
from fluxion.schemas.query import UpdateFilters
from fluxion.services.package_classifier import kernel_predicate


def apply_update_filters(stmt, filters: UpdateFilters):
    """Apply canonical update filters to a statement joined with ``hosts``."""
    stmt = stmt.where(Host.archived_at.is_(None))
    if filters.hostname:
        stmt = stmt.where(Host.hostname == filters.hostname)
    if filters.os_info:
        stmt = stmt.where(Host.os_info.ilike(f"%{_escape_like(filters.os_info)}%", escape="\\"))
    if filters.package_name:
        stmt = stmt.where(
            PackageUpdate.package_name.ilike(
                f"%{_escape_like(filters.package_name)}%", escape="\\"
            )
        )
    if filters.from_date:
        stmt = stmt.where(PackageUpdate.update_timestamp >= filters.from_date)
    if filters.to_date:
        stmt = stmt.where(PackageUpdate.update_timestamp <= filters.to_date)
    if filters.is_security is not None:
        stmt = stmt.where(PackageUpdate.is_security == filters.is_security)
    if filters.is_install is not None:
        stmt = stmt.where(
            PackageUpdate.old_version.is_(None)
            if filters.is_install
            else PackageUpdate.old_version.is_not(None)
        )
    if filters.is_kernel is not None:
        predicate = kernel_predicate(PackageUpdate.package_name)
        stmt = stmt.where(predicate if filters.is_kernel else ~predicate)
    return stmt


def _escape_like(value: str) -> str:
    """Escape user-controlled SQL LIKE metacharacters."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
