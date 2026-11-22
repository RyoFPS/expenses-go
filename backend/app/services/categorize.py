"""Auto-kategori dasar.

Urutan:
1. `category_rules` berdasarkan priority (tertinggi dulu), dicocokkan ke merchant:
   - merchant_contains: substring, case-insensitive
   - regex: re.search, case-insensitive
   Rule hanya berlaku jika tipe kategorinya sesuai tipe transaksi (income/expense).
2. Fallback `category_hint` dari parser (mis. kategori myBCA "Makanan") dicocokkan ke nama
   kategori yang sudah ada (case-insensitive, tipe sama).
Transfer hanya memakai category_hint, bukan category_rules.
"""

import logging
import re
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, CategoryRule, Transaction
from app.models.enums import CategoryType, RuleMatchType, TransactionType

logger = logging.getLogger(__name__)


def rule_matches(rule: CategoryRule, merchant: str | None) -> bool:
    if not merchant:
        return False
    if rule.match_type == RuleMatchType.merchant_contains:
        return rule.pattern.casefold() in merchant.casefold()
    try:
        return re.search(rule.pattern, merchant, re.IGNORECASE) is not None
    except re.error:
        logger.warning("category_rule id=%s regex tidak valid", rule.id)
        return False


async def pick_category(
    session: AsyncSession,
    tx_type: TransactionType,
    merchant: str | None,
    category_hint: str | None = None,
) -> uuid.UUID | None:
    cat_type = CategoryType(tx_type.value)

    if tx_type != TransactionType.transfer:
        rules = await session.scalars(
            select(CategoryRule)
            .join(Category, Category.id == CategoryRule.category_id)
            .where(Category.type == cat_type)
            .order_by(CategoryRule.priority.desc(), CategoryRule.id)
        )
        for rule in rules:
            if rule_matches(rule, merchant):
                return rule.category_id

    if category_hint:
        return await session.scalar(
            select(Category.id)
            .where(Category.type == cat_type, func.lower(Category.name) == category_hint.casefold())
            .order_by(Category.id)
            .limit(1)
        )
    return None


async def apply_rules_to_uncategorized(session: AsyncSession) -> int:
    """Jalankan ulang rules ke transaksi income/expense yang belum berkategori. Tidak commit."""
    rows = (
        await session.execute(
            select(CategoryRule, Category.type)
            .join(Category, Category.id == CategoryRule.category_id)
            .order_by(CategoryRule.priority.desc(), CategoryRule.id)
        )
    ).all()
    if not rows:
        return 0

    txs = await session.scalars(
        select(Transaction).where(
            Transaction.category_id.is_(None),
            Transaction.type.in_([TransactionType.income, TransactionType.expense]),
            Transaction.merchant.is_not(None),
        )
    )
    updated = 0
    for tx in txs:
        cat_type = CategoryType(tx.type.value)
        for rule, rule_cat_type in rows:
            if rule_cat_type == cat_type and rule_matches(rule, tx.merchant):
                tx.category_id = rule.category_id
                updated += 1
                break
    await session.flush()
    return updated
