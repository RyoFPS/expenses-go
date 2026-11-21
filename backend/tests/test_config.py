import pytest
from pydantic import ValidationError

from app.core.config import Settings

BASE = {"database_url": "postgresql+asyncpg://u:p@localhost/db", "api_key": "k"}


def test_auth_disabled_allowed_in_dev() -> None:
    s = Settings(**BASE, env="dev", auth_disabled=True, _env_file=None)
    assert s.auth_disabled is True


def test_auth_disabled_rejected_outside_dev() -> None:
    with pytest.raises(ValidationError, match="AUTH_DISABLED"):
        Settings(**BASE, env="prod", auth_disabled=True, _env_file=None)


def test_api_key_not_leaked_in_repr() -> None:
    s = Settings(**BASE, env="prod", auth_disabled=False, _env_file=None)
    assert s.api_key.get_secret_value() == "k"
    assert "'k'" not in repr(s)
