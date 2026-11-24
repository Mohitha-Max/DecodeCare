from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Server
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    # Security
    secret_key: str = "change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7 days

    # MongoDB
    mongo_url: str = "mongodb://localhost:27017"
    mongo_db: str = "decode_care"

    # Anthropic
    anthropic_api_key: str = ""

    # Uploads
    upload_dir: str = "uploads"
    max_upload_mb: int = 20

    # Tesseract
    tesseract_cmd: str = ""

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
