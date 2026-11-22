"""store Android listener heartbeats"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "9a31e82c_listener_status"
down_revision: str | None = "20261122_saving_goals"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "listener_status",
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("listener_enabled", sa.Boolean(), nullable=False),
        sa.Column("pending_count", sa.Integer(), nullable=False),
        sa.Column("failed_count", sa.Integer(), nullable=False),
        sa.Column("app_version", sa.Text(), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("device_id", name=op.f("pk_listener_status")),
    )


def downgrade() -> None:
    op.drop_table("listener_status")
