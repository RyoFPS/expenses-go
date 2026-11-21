import enum

from sqlalchemy import Enum


class AccountType(enum.StrEnum):
    bank = "bank"
    ewallet = "ewallet"
    cash = "cash"


class CategoryType(enum.StrEnum):
    income = "income"
    expense = "expense"


class ParseStatus(enum.StrEnum):
    pending = "pending"
    parsed = "parsed"
    ignored = "ignored"
    failed = "failed"


class TransactionType(enum.StrEnum):
    income = "income"
    expense = "expense"
    transfer = "transfer"


class TransactionSource(enum.StrEnum):
    notification = "notification"
    manual = "manual"
    import_ = "import"


class RuleMatchType(enum.StrEnum):
    merchant_contains = "merchant_contains"
    regex = "regex"


def pg_enum(enum_cls: type[enum.Enum], name: str) -> Enum:
    """PostgreSQL native enum yang menyimpan *value* (bukan nama member)."""
    return Enum(
        enum_cls,
        name=name,
        values_callable=lambda e: [m.value for m in e],
        validate_strings=True,
    )
