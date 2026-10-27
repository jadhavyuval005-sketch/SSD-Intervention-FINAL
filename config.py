"""Settings, read from environment variables (and an optional .env file)."""
import os
import secrets
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _csv(name, default=""):
    return [v.strip() for v in os.getenv(name, default).split(",") if v.strip()]


def _secret(name, env):
    value = os.getenv(name)
    if value and not value.startswith("change-me"):
        return value
    if env == "production":
        raise RuntimeError(f"{name} must be set to a strong random value when APP_ENV=production.")
    print(f"[vaaniai] WARNING: {name} is not set; using a temporary key. Logins will reset on every restart.")
    return secrets.token_hex(32)


class Config:
    APP_ENV = os.getenv("APP_ENV", "development").lower()
    DEBUG = APP_ENV != "production"

    SECRET_KEY = _secret("SECRET_KEY", APP_ENV)
    JWT_SECRET_KEY = _secret("JWT_SECRET_KEY", APP_ENV)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=float(os.getenv("JWT_EXPIRES_HOURS", "8")))

    _instance = BASE_DIR / "instance"
    _instance.mkdir(exist_ok=True)
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL") or f"sqlite:///{(_instance / 'vaaniai.db').as_posix()}"
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    CORS_ORIGINS = _csv(
        "CORS_ORIGINS",
        "http://localhost:5500,http://127.0.0.1:5500,http://localhost:8000,http://127.0.0.1:8000",
    )

    STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local").lower()
    UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", BASE_DIR / "uploads"))
    S3_BUCKET = os.getenv("S3_BUCKET", "")
    AWS_REGION = os.getenv("AWS_REGION", "")
    MAX_AUDIO_BYTES = int(float(os.getenv("MAX_AUDIO_MB", "10")) * 1024 * 1024)
    MAX_CONTENT_LENGTH = MAX_AUDIO_BYTES + 64 * 1024  # audio plus form fields
