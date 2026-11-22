import uuid

from fastapi import APIRouter, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SessionDep, get_or_404, unprocessable
from app.models import Category, CategoryRule
from app.models.enums import CategoryType
from app.schemas.category import (
    ApplyRulesResult,
    CategoryCreate,
    CategoryOut,
    CategoryRuleCreate,
    CategoryRuleOut,
    CategoryRuleUpdate,
    CategoryUpdate,
    check_regex,
)
from app.services.categorize import apply_rules_to_uncategorized

router = APIRouter(prefix="/categories", tags=["categories"])
rules_router = APIRouter(prefix="/category-rules", tags=["category-rules"])

MAX_DEPTH = 50


async def _validate_parent(session: AsyncSession, category: Category) -> None:
    if category.parent_id is None:
        return
    if category.parent_id == category.id:
        raise unprocessable("Kategori tidak boleh menjadi induk dirinya sendiri")
    parent = await session.get(Category, category.parent_id)
    if parent is None:
        raise unprocessable("parent_id tidak ditemukan")
    if parent.type != category.type:
        raise unprocessable("Kategori induk harus bertipe sama")
    # Cegah siklus: telusuri ke atas dari parent.
    node, depth = parent, 0
    while node.parent_id is not None and depth < MAX_DEPTH:
        if node.parent_id == category.id:
            raise unprocessable("parent_id membuat siklus")
        node = await session.get(Category, node.parent_id)
        depth += 1


async def _validate_children_type(session: AsyncSession, category: Category) -> None:
    child_mismatch = await session.scalar(
        select(Category.id).where(Category.parent_id == category.id, Category.type != category.type).limit(1)
    )
    if child_mismatch is not None:
        raise unprocessable("Tipe kategori tidak bisa diubah karena punya sub-kategori bertipe lain")


@router.get("", response_model=list[CategoryOut])
async def list_categories(session: SessionDep) -> list[Category]:
    return list(await session.scalars(select(Category).order_by(Category.type, Category.name)))


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(body: CategoryCreate, session: SessionDep) -> Category:
    category = Category(id=uuid.uuid4(), **body.model_dump())
    await _validate_parent(session, category)
    session.add(category)
    await session.commit()
    return category


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(category_id: uuid.UUID, body: CategoryUpdate, session: SessionDep) -> Category:
    category = await get_or_404(session, Category, category_id, "Kategori")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    await _validate_parent(session, category)
    await _validate_children_type(session, category)
    await session.commit()
    return category


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    description="Transaksi berkategori ini menjadi tanpa kategori; sub-kategori menjadi kategori utama; rules ikut terhapus.",
)
async def delete_category(category_id: uuid.UUID, session: SessionDep) -> Response:
    category = await get_or_404(session, Category, category_id, "Kategori")
    await session.delete(category)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- category rules ---------------------------------------------------------


async def _ensure_category(session: AsyncSession, category_id: uuid.UUID) -> None:
    category = await session.get(Category, category_id)
    if category is None:
        raise unprocessable("category_id tidak ditemukan")
    if category.type == CategoryType.transfer:
        raise unprocessable("Aturan otomatis tidak berlaku untuk kategori transfer")


@rules_router.get("", response_model=list[CategoryRuleOut])
async def list_rules(session: SessionDep) -> list[CategoryRule]:
    return list(
        await session.scalars(select(CategoryRule).order_by(CategoryRule.priority.desc(), CategoryRule.id))
    )


@rules_router.post("", response_model=CategoryRuleOut, status_code=status.HTTP_201_CREATED)
async def create_rule(body: CategoryRuleCreate, session: SessionDep) -> CategoryRule:
    await _ensure_category(session, body.category_id)
    rule = CategoryRule(**body.model_dump())
    session.add(rule)
    await session.commit()
    return rule


@rules_router.post(
    "/apply",
    response_model=ApplyRulesResult,
    description="Jalankan ulang rules ke transaksi income/expense yang belum berkategori.",
)
async def apply_rules(session: SessionDep) -> dict:
    updated = await apply_rules_to_uncategorized(session)
    await session.commit()
    return {"updated": updated}


@rules_router.patch("/{rule_id}", response_model=CategoryRuleOut)
async def update_rule(rule_id: uuid.UUID, body: CategoryRuleUpdate, session: SessionDep) -> CategoryRule:
    rule = await get_or_404(session, CategoryRule, rule_id, "Rule")
    changes = body.model_dump(exclude_unset=True)
    if "category_id" in changes:
        await _ensure_category(session, changes["category_id"])
    try:
        check_regex(changes.get("match_type", rule.match_type), changes.get("pattern", rule.pattern))
    except ValueError as exc:
        raise unprocessable(str(exc)) from exc
    for field, value in changes.items():
        setattr(rule, field, value)
    await session.commit()
    return rule


@rules_router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(rule_id: uuid.UUID, session: SessionDep) -> Response:
    rule = await get_or_404(session, CategoryRule, rule_id, "Rule")
    await session.delete(rule)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
