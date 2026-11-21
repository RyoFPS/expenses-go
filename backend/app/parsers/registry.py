"""Registry package_name Android -> parser."""

from app.parsers.base import Parser
from app.parsers.bca import BcaParser

_REGISTRY: dict[str, Parser] = {}


def register(parser: Parser) -> None:
    for pkg in parser.package_names:
        if pkg in _REGISTRY and _REGISTRY[pkg] is not parser:
            raise ValueError(f"package {pkg} sudah punya parser")
        _REGISTRY[pkg] = parser


def unregister(parser: Parser) -> None:
    for pkg in parser.package_names:
        if _REGISTRY.get(pkg) is parser:
            del _REGISTRY[pkg]


def get_parser(package_name: str) -> Parser | None:
    return _REGISTRY.get(package_name)


def registered_packages() -> set[str]:
    return set(_REGISTRY)


for _p in (BcaParser(),):
    register(_p)
