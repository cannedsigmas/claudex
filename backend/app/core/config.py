import logging
import sys
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

from pydantic import ValidationInfo, field_validator
from pydantic_settings import BaseSettings
from pythonjsonlogger import jsonlogger


class Settings(BaseSettings):
    BASE_URL: str = "http://localhost:8080"
    FRONTEND_URL: str = "http://localhost:3000"
    PROJECT_NAME: str = "AI Generation API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"  # "development" or "production"
    REQUIRE_EMAIL_VERIFICATION: bool = False

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/claudex"
    REDIS_URL: str = "redis://localhost:6379/0"

    SECRET_KEY: str = ""
    SESSION_SECRET_KEY: str | None = None
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    STORAGE_PATH: str = "/app/storage"

    ALLOWED_ORIGINS: str | list[str] = [
        "http://localhost:3000",
        "https://claudex.pro",
    ]

    TRUSTED_PROXY_HOSTS: str | list[str] = "127.0.0.1"

    @field_validator("TRUSTED_PROXY_HOSTS", mode="before")
    @classmethod
    def parse_trusted_hosts(cls, v: str | list[str]) -> str | list[str]:
        if isinstance(v, str):
            if v == "*":
                return "*"
            return [host.strip() for host in v.split(",")]
        return v

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def build_database_url(cls, v: str) -> str:
        if isinstance(v, str):
            if v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql+asyncpg://", 1)
            if v.startswith("postgresql://"):
                return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    @field_validator("REQUIRE_EMAIL_VERIFICATION", mode="before")
    @classmethod
    def set_email_verification_requirement(
        cls, v: bool | None, info: ValidationInfo
    ) -> bool:
        if v is not None:
            return bool(v)
        environment = info.data.get("ENVIRONMENT", "development")
        return bool(environment != "development")

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if not v:
            raise ValueError("SECRET_KEY must be set in environment variables")
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        return v

    @field_validator("SESSION_SECRET_KEY", mode="before")
    @classmethod
    def set_session_secret(cls, v: str | None, info: ValidationInfo) -> str | None:
        if v:
            return v
        secret_key = info.data.get("SECRET_KEY")
        if secret_key:
            return f"{secret_key}_session"
        return None

    MAX_UPLOAD_SIZE: int = 5 * 1024 * 1024  # 5MB max file size
    ALLOWED_IMAGE_TYPES: list[str] = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
    ]  # That's what Claude supports for now
    ALLOWED_FILE_TYPES: list[str] = ALLOWED_IMAGE_TYPES + [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]

    # Email configuration
    MAIL_USERNAME: str = "apikey"
    MAIL_PASSWORD: str | None = None
    MAIL_FROM: str = "noreply@claudex.pro"
    MAIL_FROM_NAME: str = "Claudex"
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "smtp.sendgrid.net"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False
    USE_CREDENTIALS: bool = True
    VALIDATE_CERTS: bool = True

    # Email validation settings
    BLOCK_DISPOSABLE_EMAILS: bool = True

    # Logging configuration
    LOG_LEVEL: str = "DEBUG"

    # Model context window (tokens)
    CONTEXT_WINDOW_TOKENS: int = 200_000

    # E2B Sandbox configuration
    E2B_TEMPLATE_ID: str = "hg02z8aexvw928qvuq87"

    # Docker Sandbox configuration
    SANDBOX_PROVIDER: str = "e2b"  # "e2b" or "docker"
    DOCKER_IMAGE: str = "ghcr.io/mng-dev-ai/claudex-sandbox:latest"
    DOCKER_NETWORK: str = "claudex-sandbox-net"
    DOCKER_HOST: str | None = None
    DOCKER_PREVIEW_BASE_URL: str = "http://localhost"

    # Security Headers Configuration
    ENABLE_SECURITY_HEADERS: bool = True
    HSTS_MAX_AGE: int = 31536000
    HSTS_INCLUDE_SUBDOMAINS: bool = True
    HSTS_PRELOAD: bool = False
    FRAME_OPTIONS: str = "DENY"
    CONTENT_TYPE_OPTIONS: str = "nosniff"
    XSS_PROTECTION: str = "1; mode=block"
    REFERRER_POLICY: str = "strict-origin-when-cross-origin"
    PERMISSIONS_POLICY: str = "geolocation=(), microphone=(), camera=()"

    # TTL Configuration (in seconds)
    TASK_TTL_SECONDS: int = 3600
    REVOCATION_POLL_INTERVAL_SECONDS: float = 0.5
    DISPOSABLE_DOMAINS_CACHE_TTL_SECONDS: int = 3600
    PERMISSION_REQUEST_TTL_SECONDS: int = 300
    CHAT_SCOPED_TOKEN_EXPIRE_MINUTES: int = 10
    CELERY_RESULT_EXPIRES_SECONDS: int = 3600
    CHAT_REVOKED_KEY_TTL_SECONDS: int = 3600
    USER_SETTINGS_CACHE_TTL_SECONDS: int = 300
    MODELS_CACHE_TTL_SECONDS: int = 3600

    class Config:
        env_file = ".env"
        case_sensitive = True


class StructuredJsonFormatter(jsonlogger.JsonFormatter):
    def add_fields(
        self,
        log_record: dict[str, Any],
        record: logging.LogRecord,
        message_dict: dict[str, Any],
    ) -> None:
        super().add_fields(log_record, record, message_dict)
        log_record["timestamp"] = datetime.now(timezone.utc).isoformat()
        log_record["level"] = record.levelname
        log_record["logger"] = record.name
        log_record["module"] = record.module
        log_record["function"] = record.funcName
        log_record["line"] = record.lineno

        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)


def _setup_logging(log_level: str, use_json: bool = True) -> None:
    level = getattr(logging, log_level.upper(), logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    formatter: logging.Formatter
    if use_json:
        formatter = StructuredJsonFormatter(
            "%(timestamp)s %(level)s %(name)s %(message)s"
        )
    else:
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )

    handler.setFormatter(formatter)
    root_logger.addHandler(handler)

    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


@lru_cache()
def get_settings() -> Settings:
    settings = Settings()
    _setup_logging(settings.LOG_LEVEL)
    return settings
