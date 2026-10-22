# Backend ingest query-plan evidence

## Scope and representative data shape

PostgreSQL representative shape: 1,000 hosts and 1,000,000 package-update rows. The data is spread across host identities and package names, with approximately 8 package-manager labels. Security updates represent approximately 10 percent of rows. Archived hosts are excluded by the application predicates.

| Migration index | Evidence row | Representative query | Checked PostgreSQL plan outcome |
|---|---|---|---|
| `ix_package_updates_host_id_package_name_update_timestamp` | `host-package-history` | Host package-history lookup by `host_id`, optional `package_name`, and descending `update_timestamp` | Index Scan or Index Only Scan uses all three leading key columns; filter and sort cost is lower than sequential scan plus sort on the 1,000,000-row shape. |
| `ix_package_updates_package_name_host_id_update_timestamp` | `package-host-history` | Package-history lookup by `package_name`, ordered by recent `update_timestamp` per host | Index Scan uses `package_name` and `host_id` to bound package rows before timestamp ordering; it avoids scanning every host update for wildcard package results. |
| `ix_package_updates_package_manager_update_timestamp` | `ingest-manager-analytics` | Analytics and diagnostics grouped or bounded by `package_manager` and `update_timestamp` | Index Scan limits manager analytics to matching manager labels and timestamp bounds instead of sequentially scanning all package updates. |

## Existing index set checked

The migration rejects a name or exact column-tuple duplicate. The checked existing package-update indexes are:

- `ix_package_updates_package_name`: `(package_name)`
- `ix_package_updates_update_timestamp`: `(update_timestamp)`
- `ix_package_updates_host_id_update_timestamp`: `(host_id, update_timestamp)`
- `ix_package_updates_package_name_update_timestamp`: `(package_name, update_timestamp)`
- `ix_package_updates_is_security_update_timestamp`: `(is_security, update_timestamp)`

## Rejection cases

The migration rejects a missing evidence row, an evidence row for an index not in the migration, a migration index name already present, a migration index column tuple already present, a second migration index with the same column tuple, or a migration index targeting a table other than `package_updates`. No index set is created after a contract rejection.

This evidence is a recorded migration-plan record. It does not claim a benchmark result for data shapes outside the representative shape.
