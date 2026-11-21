"""Validasi Cloudflare Access JWT (header Cf-Access-Jwt-Assertion) untuk endpoint dashboard.

Ingest tidak memakai ini (service token divalidasi di edge + X-API-Key di backend).
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


def verify_access_jwt(token: str, settings: Settings) -> dict:
    assert settings.cf_access_team_domain and settings.cf_access_aud
    signing_key = get_jwks_client(settings.cf_access_team_domain).get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=settings.cf_access_aud,
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
