"""Application configuration using Pydantic settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database settings
    database_url: str = "postgresql+asyncpg://fluxion:fluxion@localhost:5432/fluxion"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    sql_echo: bool = False

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
