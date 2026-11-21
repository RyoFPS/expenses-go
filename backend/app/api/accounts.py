import uuid

from fastapi import APIRouter, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import SessionDep, conflict, get_or_404
from app.models import Account
from app.schemas.account import (
    AccountBalance,
    AccountCreate,
    AccountOut,
    AccountUpdate,
    AccountWithBalance,
)
from app.schemas.transaction import TransactionOut
from app.services.balance import balance_status, calculated_balances, create_adjustment

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _integrity_detail(exc: IntegrityError) -> str:
    msg = str(exc.orig)
    if "uq_accounts_name" in msg:
        return "Nama akun sudah dipakai"
    if "uq_accounts_active_package_name" in msg:
        return "package_name sudah dipakai akun aktif lain"
    return "Data akun bentrok dengan data lain"


@router.get("", response_model=list[AccountWithBalance])
async def list_accounts(session: SessionDep, include_inactive: bool = True) -> list[dict]:
    stmt = select(Account).order_by(Account.created_at, Account.name)
    if not include_inactive:
        stmt = stmt.where(Account.is_active.is_(True))
    accounts = (await session.scalars(stmt)).all()
    balances = await calculated_balances(session, [a.id for a in accounts])
    return [
        {**AccountOut.model_validate(a).model_dump(), "balance": balances[a.id]} for a in accounts
    ]


@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
async def create_account(body: AccountCreate, session: SessionDep) -> Account:
    account = Account(**body.model_dump())
    session.add(account)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise conflict(_integrity_detail(exc)) from exc
    return account


@router.patch("/{account_id}", response_model=AccountOut)
async def update_account(account_id: uuid.UUID, body: AccountUpdate, session: SessionDep) -> Account:
    account = await get_or_404(session, Account, account_id, "Akun")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise conflict(_integrity_detail(exc)) from exc
    return account


@router.get("/{account_id}/balance", response_model=AccountBalance)
async def get_account_balance(account_id: uuid.UUID, session: SessionDep) -> dict:
    await get_or_404(session, Account, account_id, "Akun")
    return await balance_status(session, account_id)


@router.post(
    "/{account_id}/reconcile",
    response_model=TransactionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Buat transaksi penyesuaian saldo",
    description=(
        "Membuat transaksi manual berkategori 'Penyesuaian saldo' sebesar selisih (diff) agar saldo "
        "terhitung sama dengan snapshot terakhir. 409 jika belum ada snapshot atau saldo sudah cocok."
    ),
)
async def reconcile_account(account_id: uuid.UUID, session: SessionDep):
    await get_or_404(session, Account, account_id, "Akun")
    tx = await create_adjustment(session, account_id)
    if tx is None:
        raise conflict("Tidak ada selisih saldo untuk disesuaikan")
    await session.commit()
    await session.refresh(tx)
    return tx
