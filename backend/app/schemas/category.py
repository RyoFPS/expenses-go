import re
import uuid
from typing import Annotated

from pydantic import Field, StrictInt, model_validator

from app.models.enums import CategoryType, RuleMatchType
from app.schemas.common import ORMModel, StrictInput

Name = Annotated[str, Field(min_length=1, max_length=100)]
Icon = Annotated[str, Field(min_length=1, max_length=50)]
Color = Annotated[str, Field(pattern=r"^#[0-9A-Fa-f]{6}$")]


class CategoryCreate(StrictInput):
    name: Name
    type: CategoryType
    icon: Icon | None = None
    color: Color | None = None
    parent_id: uuid.UUID | None = None


class CategoryUpdate(StrictInput):
    name: Name | None = None
    type: CategoryType | None = None
    icon: Icon | None = None
    color: Color | None = None
    parent_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _no_null(self) -> "CategoryUpdate":
        self.reject_nulls("name", "type")
        return self


class CategoryOut(ORMModel):
    id: uuid.UUID
    name: str
    type: CategoryType
    icon: str | None
    color: str | None
    parent_id: uuid.UUID | None


Pattern = Annotated[str, Field(min_length=1, max_length=200)]


def check_regex(match_type: RuleMatchType | None, pattern: str | None) -> None:
    if match_type == RuleMatchType.regex and pattern is not None:
        try:
            re.compile(pattern)
        except re.error as exc:
            raise ValueError(f"regex tidak valid: {exc}") from exc


class CategoryRuleCreate(StrictInput):
    match_type: RuleMatchType
    pattern: Pattern
    category_id: uuid.UUID
    priority: StrictInt = 0

    @model_validator(mode="after")
    def _regex(self) -> "CategoryRuleCreate":
        check_regex(self.match_type, self.pattern)
        return self


class CategoryRuleUpdate(StrictInput):
    match_type: RuleMatchType | None = None
    pattern: Pattern | None = None
    category_id: uuid.UUID | None = None
    priority: StrictInt | None = None

    @model_validator(mode="after")
    def _no_null(self) -> "CategoryRuleUpdate":
        self.reject_nulls("match_type", "pattern", "category_id", "priority")
        return self


class CategoryRuleOut(ORMModel):
    id: uuid.UUID
    match_type: RuleMatchType
    pattern: str
    category_id: uuid.UUID
    priority: int


class ApplyRulesResult(ORMModel):
    updated: int
