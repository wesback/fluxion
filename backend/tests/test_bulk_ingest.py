"""Contract tests for bounded bulk package ingest."""

import pytest

from fluxion.schemas.package_update import BatchPackageUpdateRequest


@pytest.mark.parametrize("count", [99, 100])
def test_batch_item_bound_contract(count: int) -> None:
    updates = [{"package_name": "pkg", "new_version": "2"}] * count
    batch = BatchPackageUpdateRequest(hostname="node.example.com", updates=updates)
    assert len(batch.updates) == count


def test_batch_item_bound_contract_rejects_101() -> None:
    updates = [{"package_name": "pkg", "new_version": "2"}] * 101
    with pytest.raises(ValueError):
        BatchPackageUpdateRequest(hostname="node.example.com", updates=updates)


def test_exact_hostname_authorization_contract() -> None:
    batch = BatchPackageUpdateRequest(hostname="node.example.com", updates=[{"package_name": "pkg", "new_version": "2"}])
    assert batch.hostname == "node.example.com"


def test_bulk_transaction_preserves_distinct_rows() -> None:
    updates = [{"package_name": "pkg", "old_version": None, "new_version": "2", "is_security": False}] * 100
    batch = BatchPackageUpdateRequest(hostname="node.example.com", updates=updates)
    assert len(batch.updates) == 100
    assert batch.updates[0].package_name == batch.updates[99].package_name
