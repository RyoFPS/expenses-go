import pytest
from pydantic import ValidationError

from app.core.config import Settings

BASE = {"database_url": "postgresql+asyncpg://u:p@localhost/db", "api_key": "k", "_env_file": None}
CF = {
    "cf_access_team_domain": "tim.cloudflareaccess.com",
    "cf_access_aud": "aud123",
    "cf_access_ingest_aud": "aud-ingest",
}


def test_auth_disabled_allowed_in_dev() -> None:
    s = Settings(**BASE, env="dev", auth_disabled=True)
    assert s.auth_disabled is True


def test_auth_disabled_rejected_outside_dev() -> None:
    with pytest.raises(ValidationError, match="AUTH_DISABLED"):
        Settings(**BASE, **CF, env="prod", auth_disabled=True)


@pytest.mark.parametrize("missing", ["cf_access_team_domain", "cf_access_aud", "cf_access_ingest_aud"])
def test_cloudflare_config_required_when_auth_enabled(missing: str) -> None:
    cf = {**CF, missing: ""}
    with pytest.raises(ValidationError, match="CF_ACCESS"):
        Settings(**BASE, **cf, env="prod", auth_disabled=False)


def test_team_domain_normalized() -> None:
    s = Settings(**BASE, env="prod", auth_disabled=False, cf_access_aud="a", cf_access_ingest_aud="b",
                 cf_access_team_domain="https://tim.cloudflareaccess.com/")
    assert s.cf_access_team_domain == "tim.cloudflareaccess.com"


def test_api_key_not_leaked_in_repr() -> None:
    s = Settings(**BASE, **CF, env="prod", auth_disabled=False)
    assert s.api_key.get_secret_value() == "k"
    assert "'k'" not in repr(s)
