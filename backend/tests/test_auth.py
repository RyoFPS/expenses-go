"""Cloudflare Access JWT untuk endpoint dashboard; ingest tetap pakai X-API-Key."""

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core import auth
from app.core.config import Settings, get_settings
from app.main import app
from tests.conftest import TEST_API_KEY

TEAM = "tim.cloudflareaccess.com"
AUD = "aud-tag-123"
INGEST_AUD = "aud-ingest-456"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class FakeJWKClient:
    def get_signing_key_from_jwt(self, token: str):
        header = jwt.get_unverified_header(token)
        if header.get("kid") != "k1":
            raise jwt.PyJWKClientError("kid tidak dikenal")
        return type("SigningKey", (), {"key": KEY.public_key()})()


def make_token(*, key=KEY, aud=AUD, iss=f"https://{TEAM}", exp_in=300, kid="k1", alg="RS256") -> str:
    now = int(time.time())
    claims = {"aud": [aud], "iss": iss, "iat": now, "exp": now + exp_in, "email": "saya@example.com", "sub": "u1"}
    return jwt.encode(claims, key, algorithm=alg, headers={"kid": kid})


@pytest.fixture
def auth_enabled(monkeypatch):
    settings = Settings(
        database_url="postgresql+asyncpg://unused/db",
        api_key=TEST_API_KEY,
        env="prod",
        auth_disabled=False,
        cf_access_team_domain=TEAM,
        cf_access_aud=AUD,
        cf_access_ingest_aud=INGEST_AUD,
        _env_file=None,
    )
    monkeypatch.setattr(auth, "get_jwks_client", lambda domain: FakeJWKClient())
    app.dependency_overrides[get_settings] = lambda: settings
    yield
    app.dependency_overrides.pop(get_settings, None)


async def test_valid_token_allowed(client, auth_enabled) -> None:
    resp = await client.get("/api/v1/accounts", headers={"Cf-Access-Jwt-Assertion": make_token()})
    assert resp.status_code == 200


@pytest.mark.parametrize(
    "token",
    [
        None,
        "",
        "bukan-jwt",
        make_token(key=OTHER_KEY),
        make_token(aud="aud-lain"),
        make_token(iss="https://tim-lain.cloudflareaccess.com"),
        make_token(exp_in=-120),
        make_token(kid="k-lain"),
        jwt.encode({"aud": AUD, "iss": f"https://{TEAM}", "exp": int(time.time()) + 60}, "secret", algorithm="HS256"),
    ],
    ids=["missing", "empty", "garbage", "wrong-key", "wrong-aud", "wrong-iss", "expired", "unknown-kid", "hs256"],
)
async def test_invalid_token_rejected(client, auth_enabled, token) -> None:
    headers = {} if token is None else {"Cf-Access-Jwt-Assertion": token}
    for method, path in [
        ("GET", "/api/v1/accounts"),
        ("GET", "/api/v1/transactions"),
        ("GET", "/api/v1/categories"),
        ("GET", "/api/v1/category-rules"),
        ("GET", "/api/v1/raw-notifications"),
        ("GET", "/api/v1/reports/net-worth"),
        ("POST", "/api/v1/transactions"),
    ]:
        resp = await client.request(method, path, headers=headers)
        assert resp.status_code == 401, (method, path)
        assert resp.json() == {"detail": "Unauthorized"}


def service_token(aud: str = INGEST_AUD, common_name: str = "abc123.access") -> str:
    """JWT yang diterbitkan Access untuk service token: tanpa email, punya common_name (= Client ID)."""
    now = int(time.time())
    claims = {"aud": [aud], "iss": f"https://{TEAM}", "iat": now, "exp": now + 300, "common_name": common_name, "sub": ""}
    return jwt.encode(claims, KEY, algorithm="RS256", headers={"kid": "k1"})


NOTIF = {"package_name": "com.x", "title": "t", "text": "x", "posted_at": 1_763_700_000_000}


async def test_healthz_needs_no_auth(client, auth_enabled) -> None:
    assert (await client.get("/healthz")).status_code == 200


async def test_ingest_with_service_token_and_api_key(client, auth_enabled) -> None:
    headers = {"X-API-Key": TEST_API_KEY, "Cf-Access-Jwt-Assertion": service_token()}
    assert (await client.post("/api/v1/ingest/notification", json=NOTIF, headers=headers)).status_code == 202


@pytest.mark.parametrize(
    "token",
    [
        None,
        "sampah",
        make_token(),  # JWT login dashboard (AUD dashboard, tanpa common_name)
        make_token(aud=INGEST_AUD),  # AUD ingest tapi dari login pengguna, bukan service token
        service_token(aud=AUD),  # service token untuk aplikasi Access lain
        service_token(common_name=""),
        service_token(aud="aud-lain"),
    ],
    ids=["missing", "garbage", "user-jwt", "user-jwt-ingest-aud", "dashboard-aud", "no-common-name", "unknown-aud"],
)
async def test_ingest_rejects_without_valid_service_token(client, db_sessionmaker, auth_enabled, token) -> None:
    headers = {"X-API-Key": TEST_API_KEY} | ({"Cf-Access-Jwt-Assertion": token} if token else {})
    assert (await client.post("/api/v1/ingest/notification", json=NOTIF, headers=headers)).status_code == 401
    assert (await client.post("/api/v1/ingest/notification/batch", json=[NOTIF], headers=headers)).status_code == 401


async def test_ingest_service_token_still_needs_api_key(client, auth_enabled) -> None:
    headers = {"X-API-Key": "salah", "Cf-Access-Jwt-Assertion": service_token()}
    assert (await client.post("/api/v1/ingest/notification", json=NOTIF, headers=headers)).status_code == 401


async def test_ingest_service_token_not_valid_for_dashboard(client, auth_enabled) -> None:
    resp = await client.get("/api/v1/accounts", headers={"Cf-Access-Jwt-Assertion": service_token()})
    assert resp.status_code == 401


async def test_auth_disabled_in_dev_allows_without_token(client) -> None:
    assert (await client.get("/api/v1/accounts")).status_code == 200
