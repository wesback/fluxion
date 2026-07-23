"""Bounded JSON and CSV export helpers."""

from __future__ import annotations

import csv
import io
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

MAX_EXPORT_ROWS = 10_000


@dataclass(frozen=True)
class ExportPayload:
    """Serialized export payload and the rows included in it."""

    body: str
    content_type: str
    rows: list[Mapping[str, Any]]


def export_rows(rows: Sequence[Mapping[str, Any]], format: str) -> ExportPayload:
    """Serialize at most ``MAX_EXPORT_ROWS`` rows as JSON or CSV."""
    bounded_rows = list(rows[:MAX_EXPORT_ROWS])
    normalized_format = format.lower()

    if normalized_format == "json":
        return ExportPayload(
            body=json.dumps(bounded_rows, default=str),
            content_type="application/json",
            rows=bounded_rows,
        )
    if normalized_format == "csv":
        output = io.StringIO()
        fieldnames = list(bounded_rows[0].keys()) if bounded_rows else []
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        if fieldnames:
            writer.writeheader()
            writer.writerows(bounded_rows)
        return ExportPayload(body=output.getvalue(), content_type="text/csv", rows=bounded_rows)

    raise ValueError("format must be either 'csv' or 'json'")
