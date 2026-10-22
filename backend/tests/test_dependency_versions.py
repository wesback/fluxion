"""Dependency declarations and Python compatibility metadata."""

import re
import tomllib
from pathlib import Path

from packaging.requirements import Requirement
from packaging.specifiers import SpecifierSet
from packaging.version import Version

BACKEND_ROOT = Path(__file__).resolve().parents[1]

DEPENDENCY_SNAPSHOT = {
    "sqlalchemy": {"version": "2.1.5", "prerelease": False, "requires_python": ">=3.11"},
    "alembic": {"version": "1.20.0", "prerelease": False, "requires_python": ">=3.10"},
    "asyncpg": {"version": "0.32.0", "prerelease": False, "requires_python": ">=3.9.0"},
    "aiosqlite": {"version": "0.21.0", "prerelease": False, "requires_python": ">=3.9"},
    "psycopg2-binary": {"version": "2.9.13", "prerelease": False, "requires_python": ">=3.10"},
    "fastapi": {"version": "0.143.3", "prerelease": False, "requires_python": ">=3.10"},
    "uvicorn": {"version": "0.54.0", "prerelease": False, "requires_python": ">=3.10"},
    "pydantic": {"version": "2.14.1", "prerelease": False, "requires_python": ">=3.10"},
    "pydantic-settings": {"version": "2.16.0", "prerelease": False, "requires_python": ">=3.11"},
    "bcrypt": {"version": "5.0.0", "prerelease": False, "requires_python": ">=3.8"},
    "httpx": {"version": "0.28.1", "prerelease": False, "requires_python": ">=3.8"},
    "opentelemetry-api": {"version": "1.45.1", "prerelease": False, "requires_python": ">=3.10"},
    "opentelemetry-sdk": {"version": "1.45.1", "prerelease": False, "requires_python": ">=3.10"},
    "opentelemetry-instrumentation-fastapi": {
        "version": "0.66b1",
        "prerelease": True,
        "requires_python": ">=3.10",
    },
    "opentelemetry-instrumentation-sqlalchemy": {
        "version": "0.66b1",
        "prerelease": True,
        "requires_python": ">=3.10",
    },
    "opentelemetry-exporter-otlp": {
        "version": "1.45.1",
        "prerelease": False,
        "requires_python": ">=3.10",
    },
    "opentelemetry-exporter-otlp-proto-grpc": {
        "version": "1.45.1",
        "prerelease": False,
        "requires_python": ">=3.10",
    },
    "opentelemetry-exporter-otlp-proto-http": {
        "version": "1.45.1",
        "prerelease": False,
        "requires_python": ">=3.10",
    },
    "python-dotenv": {"version": "1.2.4", "prerelease": False, "requires_python": ">=3.10"},
    "pytest": {"version": "9.1.1", "prerelease": False, "requires_python": ">=3.10"},
    "pytest-asyncio": {"version": "1.4.0", "prerelease": False, "requires_python": ">=3.10"},
    "pytest-cov": {"version": "7.1.0", "prerelease": False, "requires_python": ">=3.9"},
    "ruff": {"version": "0.17.1", "prerelease": False, "requires_python": ">=3.7"},
    "mypy": {"version": "2.4.0", "prerelease": False, "requires_python": ">=3.10"},
}

NO_STABLE_RELEASES = {
    "opentelemetry-instrumentation-fastapi": {
        "package_name": "opentelemetry-instrumentation-fastapi",
        "latest_stable_version": None,
        "selected_version": "0.66b1",
        "blocker": (
            "PyPI has no non-prerelease releases; the service imports FastAPIInstrumentor "
            "to preserve FastAPI tracing."
        ),
    },
    "opentelemetry-instrumentation-sqlalchemy": {
        "package_name": "opentelemetry-instrumentation-sqlalchemy",
        "latest_stable_version": None,
        "selected_version": "0.66b1",
        "blocker": (
            "PyPI has no non-prerelease releases; the service imports SQLAlchemyInstrumentor "
            "to preserve database tracing."
        ),
    },
}


def _canonical_name(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _requirements(lines: list[str]) -> dict[str, Requirement]:
    parsed = [
        Requirement(line)
        for line in lines
        if line.strip() and not line.lstrip().startswith("#")
    ]
    return {_canonical_name(requirement.name): requirement for requirement in parsed}


def _runtime_declarations() -> tuple[dict[str, Requirement], dict[str, Requirement]]:
    requirements_lines = (BACKEND_ROOT / "requirements.txt").read_text().splitlines()
    project_metadata = tomllib.loads((BACKEND_ROOT / "pyproject.toml").read_text())
    return (
        _requirements(requirements_lines),
        _requirements(project_metadata["project"]["dependencies"]),
    )


def _development_declarations() -> dict[str, Requirement]:
    project_metadata = tomllib.loads((BACKEND_ROOT / "pyproject.toml").read_text())
    return _requirements(project_metadata["project"]["optional-dependencies"]["dev"])


def _accepts_python_311(metadata: dict[str, object]) -> bool:
    requires_python = metadata["requires_python"]
    return isinstance(requires_python, str) and SpecifierSet(requires_python).contains("3.11")


def _is_accepted_release(metadata: dict[str, object]) -> bool:
    if metadata["prerelease"] or not _accepts_python_311(metadata):
        return False
    return True


def test_dependency_targets_are_latest_stable_for_python_311() -> None:
    """AC: selected targets are current Python 3.11 releases or documented no-stable exceptions."""
    requirements, project_dependencies = _runtime_declarations()
    development_dependencies = _development_declarations()
    assert requirements.keys() == project_dependencies.keys()
    assert set(development_dependencies) == {
        "pytest",
        "pytest-asyncio",
        "pytest-cov",
        "ruff",
        "mypy",
    }
    assert set(DEPENDENCY_SNAPSHOT) == set(requirements) | {
        "pytest",
        "pytest-asyncio",
        "pytest-cov",
        "ruff",
        "mypy",
    }

    exceptions = set(NO_STABLE_RELEASES)
    assert all(
        set(record) == {"package_name", "latest_stable_version", "selected_version", "blocker"}
        and record["package_name"] == name
        and record["latest_stable_version"] is None
        and bool(record["blocker"])
        for name, record in NO_STABLE_RELEASES.items()
    )

    for name, metadata in DEPENDENCY_SNAPSHOT.items():
        version = Version(metadata["version"])
        assert metadata["prerelease"] is version.is_prerelease
        assert _accepts_python_311(metadata)
        if metadata["prerelease"]:
            assert name in exceptions
            assert NO_STABLE_RELEASES[name]["selected_version"] == metadata["version"]
        else:
            assert name not in exceptions
        declared = requirements.get(name, development_dependencies.get(name))
        if declared is None:
            continue

        lower_bounds = [
            Version(specifier.version)
            for specifier in declared.specifier
            if specifier.operator in (">=", "==", "===")
        ]
        assert lower_bounds
        assert max(lower_bounds) >= version
        assert declared.specifier.contains(version, prereleases=True)


def test_runtime_requirements_match_project_metadata() -> None:
    """AC: runtime package names, extras, and specifiers exactly match in both declarations."""
    requirements, project_dependencies = _runtime_declarations()
    requirements_declarations = {
        name: (tuple(sorted(requirement.extras)), str(requirement.specifier))
        for name, requirement in requirements.items()
    }
    project_declarations = {
        name: (tuple(sorted(requirement.extras)), str(requirement.specifier))
        for name, requirement in project_dependencies.items()
    }
    assert requirements_declarations == project_declarations
    assert "python-dotenv" in requirements_declarations


def test_prerelease_and_python_compatibility_cases() -> None:
    """AC: stable compatible metadata passes; prerelease and Python-incompatible metadata fail."""
    compatible_stable = {
        "prerelease": False,
        "requires_python": ">=3.10",
    }
    prerelease = {
        "prerelease": True,
        "requires_python": ">=3.10",
    }
    python_incompatible = {
        "prerelease": False,
        "requires_python": ">=3.12",
    }

    assert _is_accepted_release(compatible_stable)
    assert not _is_accepted_release(prerelease)
    assert not _is_accepted_release(python_incompatible)
