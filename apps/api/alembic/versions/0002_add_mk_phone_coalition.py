"""Add phone and is_coalition columns to members

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("members", sa.Column("phone", sa.String(), nullable=True))
    op.add_column(
        "members",
        sa.Column("is_coalition", sa.Boolean(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("members", "is_coalition")
    op.drop_column("members", "phone")
