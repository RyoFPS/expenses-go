from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

TZ_NAME = "Asia/Jakarta"
JAKARTA = ZoneInfo(TZ_NAME)


def now_utc() -> datetime:
    return datetime.now(UTC)


def day_start_utc(d: date) -> datetime:
    """Awal hari `d` (00:00 WIB) dalam UTC."""
    return datetime.combine(d, time.min, tzinfo=JAKARTA).astimezone(UTC)


def day_end_exclusive_utc(d: date) -> datetime:
    return day_start_utc(d + timedelta(days=1))


def month_bounds_utc(year: int, month: int) -> tuple[datetime, datetime]:
    start = date(year, month, 1)
    nxt = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return day_start_utc(start), day_start_utc(nxt)


def today_jakarta() -> date:
    return datetime.now(JAKARTA).date()
