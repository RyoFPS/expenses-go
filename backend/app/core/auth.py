"""Validasi Cloudflare Access JWT (header Cf-Access-Jwt-Assertion).

- Dashboard: JWT aplikasi Access dashboard (login email), AUD = CF_ACCESS_AUD.
- Ingest: JWT aplikasi Access ingest (Service Auth), AUD = CF_ACCESS_INGEST_AUD, dan harus berasal dari
  service token (klaim `common_name`). Lapisan tambahan di atas X-API-Key (defense-in-depth).
Dependency sengaja sinkron: pengambilan JWKS (urllib) berjalan di threadpool FastAPI.
"""

import logging
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class AccessUser(BaseModel):
    email: str | None = None
    sub: str | None = None


@lru_cache
def get_jwks_client(team_domain: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"https://{team_domain}/cdn-cgi/access/certs", cache_keys=True, lifespan=3600)


def verify_access_jwt(token: str, settings: Settings, audience: str | None = None) -> dict:
    aud = audience or settings.cf_access_aud
    assert settings.cf_access_team_domain and aud
    signing_key = get_jwks_client(settings.cf_access_team_domain).get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=aud,
        issuer=f"https://{settings.cf_access_team_domain}",
        options={"require": ["exp", "iat", "iss", "aud"]},
    )


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


def require_user(
    settings: Annotated[Settings, Depends(get_settings)],
    cf_access_jwt_assertion: Annotated[str | None, Header(include_in_schema=False)] = None,
) -> AccessUser:
    if settings.auth_disabled:
        return AccessUser(email="dev@localhost")
    if not cf_access_jwt_assertion:
        raise _unauthorized()
    try:
        claims = verify_access_jwt(cf_access_jwt_assertion, settings)
    except (jwt.PyJWTError, jwt.PyJWKClientError) as exc:
        logger.info("Cloudflare Access JWT ditolak: %s", type(exc).__name__)
        raise _unauthorized() from exc
    return AccessUser(email=claims.get("email"), sub=claims.get("sub"))


def require_ingest_access(
    settings: Annotated[Settings, Depends(get_settings)],
    cf_access_jwt_assertion: Annotated[str | None, Header(include_in_schema=False)] = None,
) -> None:
    """Ingest hanya dari service token Cloudflare Access (selain X-API-Key)."""
    if settings.auth_disabled:
        return
    if not cf_access_jwt_assertion:
        raise _unauthorized()
    try:
        claims = verify_access_jwt(cf_access_jwt_assertion, settings, audience=settings.cf_access_ingest_aud)
    except (jwt.PyJWTError, jwt.PyJWKClientError) as exc:
        logger.info("Cloudflare Access JWT ingest ditolak: %s", type(exc).__name__)
        raise _unauthorized() from exc
    # JWT login pengguna punya `email`; JWT service token punya `common_name` (= Client ID).
    if not claims.get("common_name"):
        logger.info("Cloudflare Access JWT ingest ditolak: bukan service token")
        raise _unauthorized()
