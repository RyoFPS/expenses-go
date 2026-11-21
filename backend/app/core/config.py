from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Konfigurasi aplikasi. Semua secret hanya lewat environment variable."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: Literal["dev", "prod"] = "prod"
    database_url: str
    api_key: SecretStr
    auth_disabled: bool = False

    # Cloudflare Access: validasi header Cf-Access-Jwt-Assertion untuk endpoint non-ingest.
    # team domain mis. "namatim.cloudflareaccess.com"; aud = Application Audience (AUD) tag.
    cf_access_team_domain: str | None = None
    cf_access_aud: str | None = None

    log_level: str = "INFO"

    @field_validator("cf_access_team_domain", "cf_access_aud", mode="before")
    @classmethod
    def _empty_to_none(cls, v: str | None) -> str | None:
        return v.strip() or None if isinstance(v, str) else v

    @field_validator("cf_access_team_domain")
    @classmethod
    def _normalize_domain(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.removeprefix("https://").removeprefix("http://").rstrip("/")

    @model_validator(mode="after")
    def _auth_config(self) -> "Settings":
        if self.auth_disabled:
            if self.env != "dev":
                raise ValueError("AUTH_DISABLED=true hanya boleh dipakai jika ENV=dev")
        elif not (self.cf_access_team_domain and self.cf_access_aud):
            raise ValueError(
                "CF_ACCESS_TEAM_DOMAIN dan CF_ACCESS_AUD wajib diisi jika AUTH_DISABLED tidak aktif"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
