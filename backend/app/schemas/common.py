from typing import Annotated, Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class PageParams(BaseModel):
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def page_params(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> PageParams:
    return PageParams(page=page, page_size=page_size)


class StrictInput(BaseModel):
    """Basis body request: field asing ditolak."""

    model_config = ConfigDict(extra="forbid")

    def reject_nulls(self, *fields: str) -> None:
        for f in fields:
            if f in self.model_fields_set and getattr(self, f) is None:
                raise ValueError(f"{f} tidak boleh null")
