from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Konfigurasi aplikasi. Semua secret hanya lewat environment variable."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: Literal["dev", "prod"] = "prod"
    database_url: str
    api_key: SecretStr
    auth_disabled: bool = False

    # Cloudflare Access (dipakai mulai M3 untuk validasi Cf-Access-Jwt-Assertion)
    cf_access_team_domain: str | None = None
    cf_access_aud: str | None = None

    log_level: str = "INFO"

    @model_validator(mode="after")
    def _auth_disabled_only_in_dev(self) -> "Settings":
        if self.auth_disabled and self.env != "dev":
            raise ValueError("AUTH_DISABLED=true hanya boleh dipakai jika ENV=dev")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
