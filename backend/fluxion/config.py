"""Application configuration using Pydantic settings."""

import math

from pydantic import AliasChoices, Field, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", populate_by_name=True
    )

    # Database settings: no pool value is unbounded. Required pool settings are checked before engine creation.
    database_url: str | None = None
    db_pool_size: int | None = Field(default=None, validation_alias=AliasChoices("DB_POOL_SIZE", "API_POOL_SIZE"))
    db_max_overflow: int | None = Field(default=None, validation_alias=AliasChoices("DB_MAX_OVERFLOW", "API_MAX_OVERFLOW"))
    api_replicas: int | None = Field(default=None, validation_alias=AliasChoices("API_REPLICAS", "API_REPLICA_COUNT"))
    relay_pool_size: int | None = Field(default=None, validation_alias="RELAY_POOL_SIZE")
    relay_worker_count: int | None = Field(default=None, validation_alias="RELAY_WORKER_COUNT")
    db_pool_timeout: float | None = Field(default=None, validation_alias=AliasChoices("DB_POOL_TIMEOUT", "POOL_CHECKOUT_TIMEOUT"))
    db_pool_recycle: int | None = Field(default=None, validation_alias=AliasChoices("DB_POOL_RECYCLE", "POOL_RECYCLE_INTERVAL"))
    postgres_max_connections: int | None = Field(default=None, validation_alias=AliasChoices("POSTGRES_MAX_CONNECTIONS", "DB_MAX_CONNECTIONS"))
    reserved_connections: int | None = Field(default=None, validation_alias=AliasChoices("RESERVED_CONNECTIONS", "DB_RESERVED_CONNECTIONS"))
    sql_echo: bool = False

    @field_validator("db_pool_timeout", mode="before")
    @classmethod
    def validate_timeout(cls, value):
        if value is None:
            return value
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            raise ValueError("DB_POOL_TIMEOUT must be a number") from None
        if not math.isfinite(parsed):
            raise ValueError("DB_POOL_TIMEOUT must be a finite number")
        return parsed

    @field_validator(
        "api_replicas", "db_pool_size", "db_max_overflow", "relay_pool_size",
        "relay_worker_count", "db_pool_recycle", "postgres_max_connections",
        "reserved_connections", mode="before",
    )
    @classmethod
    def validate_whole_number(cls, value, info: ValidationInfo):
        if value is None:
            return value
        env_names = {
            "api_replicas": "API_REPLICAS", "db_pool_size": "API_POOL_SIZE",
            "db_max_overflow": "API_MAX_OVERFLOW", "relay_pool_size": "RELAY_POOL_SIZE",
            "relay_worker_count": "RELAY_WORKER_COUNT", "db_pool_recycle": "DB_POOL_RECYCLE",
            "postgres_max_connections": "POSTGRES_MAX_CONNECTIONS",
            "reserved_connections": "RESERVED_CONNECTIONS",
        }
        name = env_names[info.field_name]
        if isinstance(value, bool):
            raise ValueError(f"{name} must be an integer")
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            raise ValueError(f"{name} must be an integer") from None
        if isinstance(value, str) and value.strip() != str(parsed):
            raise ValueError(f"{name} must be an integer")
        if isinstance(value, float) and not value.is_integer():
            raise ValueError(f"{name} must be an integer")
        return parsed

    def validate_pool_startup(self) -> None:
        required = {
            "DATABASE_URL": self.database_url,
            "API_REPLICAS": self.api_replicas,
            "API_POOL_SIZE": self.db_pool_size,
            "API_MAX_OVERFLOW": self.db_max_overflow,
            "RELAY_POOL_SIZE": self.relay_pool_size,
            "RELAY_WORKER_COUNT": self.relay_worker_count,
            "DB_POOL_TIMEOUT": self.db_pool_timeout,
            "DB_POOL_RECYCLE": self.db_pool_recycle,
            "POSTGRES_MAX_CONNECTIONS": self.postgres_max_connections,
            "RESERVED_CONNECTIONS": self.reserved_connections,
        }
        missing = [name for name, value in required.items() if value is None or (isinstance(value, str) and not value.strip())]
        if missing:
            raise RuntimeError(f"Missing required pool setting: {missing[0]}")
        if not self.database_url:
            raise RuntimeError("Missing required pool setting: DATABASE_URL")
        try:
            database_url = make_url(self.database_url)
        except ArgumentError:
            raise RuntimeError("DATABASE_URL must contain a non-empty username and password") from None
        username = database_url.username.strip() if database_url.username else ""
        password = database_url.password.strip() if database_url.password else ""
        if not username:
            raise RuntimeError("DATABASE_URL must contain a non-empty username")
        if not password:
            raise RuntimeError("DATABASE_URL must contain a non-empty password")
        if self.api_replicas < 1 or self.api_replicas > 10:
            raise RuntimeError("API_REPLICAS must be between 1 and 10")
        if self.db_pool_size < 0:
            raise RuntimeError("API_POOL_SIZE must be non-negative")
        if self.db_max_overflow < 0:
            raise RuntimeError("API_MAX_OVERFLOW must be non-negative")
        if self.relay_pool_size < 0:
            raise RuntimeError("RELAY_POOL_SIZE must be non-negative")
        if self.relay_worker_count < 0:
            raise RuntimeError("RELAY_WORKER_COUNT must be non-negative")
        api_total = self.db_pool_size + self.db_max_overflow
        relay_total = self.relay_pool_size
        aggregate = self.api_replicas * api_total + relay_total
        if api_total > 8:
            raise RuntimeError("API pool total must be less than or equal to 8")
        if relay_total > 8:
            raise RuntimeError("Relay pool total must be less than or equal to 8")
        if aggregate > 80:
            raise RuntimeError("Aggregate application pool allocation must be less than or equal to 80")
        if self.postgres_max_connections != 100:
            raise RuntimeError("POSTGRES_MAX_CONNECTIONS must be 100")
        if self.reserved_connections != 20:
            raise RuntimeError("RESERVED_CONNECTIONS must be 20")
        if self.db_pool_timeout <= 0:
            raise RuntimeError("DB_POOL_TIMEOUT must be positive")
        if self.db_pool_recycle < 0:
            raise RuntimeError("DB_POOL_RECYCLE must be non-negative")

    # API settings
    api_port: int = 8000
    api_host: str = "0.0.0.0"
    log_level: str = "info"
    # CORS: Use ["*"] for development only. In production, specify allowed origins:
    # CORS_ORIGINS=["https://dashboard.example.com","https://admin.example.com"]
    cors_origins: list[str] = ["*"]

    # Weekly bounded retention maintenance.
    package_update_retention_days: int = 365
    webhook_history_retention_days: int = 365
    retention_batch_size: int = 1000

    # Application metadata
    app_name: str = "Fluxion"
    app_version: str = "0.1.0"

    # OpenTelemetry settings
    otel_enabled: bool = True
    otel_exporter_type: str = "console"  # "console", "otlp", or "otlp-http"
    otel_exporter_otlp_endpoint: str = "http://localhost:4317"
    otel_service_name: str = "fluxion"
    otel_environment: str = "development"


# Global settings instance
settings = Settings()
