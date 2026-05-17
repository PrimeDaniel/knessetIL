"""Initial schema — members, factions, bills, votes

Revision ID: 0001
Revises:
Create Date: 2026-05-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── members ──────────────────────────────────────────────────────────────
    op.create_table(
        "members",
        sa.Column("mk_individual_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=True),
        sa.Column("last_name", sa.String(), nullable=True),
        sa.Column("last_name_eng", sa.String(), nullable=True),
        sa.Column("first_name", sa.String(), nullable=True),
        sa.Column("first_name_eng", sa.String(), nullable=True),
        sa.Column("photo_url", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("gender_desc", sa.String(), nullable=True),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("mk_individual_id"),
    )
    op.create_index("ix_members_person_id", "members", ["person_id"])
    op.create_index("ix_members_is_current", "members", ["is_current"])

    # ── member_factions ───────────────────────────────────────────────────────
    op.create_table(
        "member_factions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("mk_individual_id", sa.Integer(), nullable=False),
        sa.Column("faction_id", sa.Integer(), nullable=False),
        sa.Column("faction_name", sa.String(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("finish_date", sa.Date(), nullable=True),
        sa.Column("knesset_num", sa.Integer(), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "mk_individual_id", "faction_id", "start_date", name="uq_member_faction_start"
        ),
    )
    op.create_index("ix_member_factions_mk_individual_id", "member_factions", ["mk_individual_id"])
    op.create_index("ix_member_factions_faction_id", "member_factions", ["faction_id"])

    # ── factions ──────────────────────────────────────────────────────────────
    op.create_table(
        "factions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("finish_date", sa.Date(), nullable=True),
        sa.Column("knessets", postgresql.ARRAY(sa.Integer()), nullable=False, server_default="{}"),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── bills ─────────────────────────────────────────────────────────────────
    op.create_table(
        "bills",
        sa.Column("bill_id", sa.Integer(), nullable=False),
        sa.Column("knesset_num", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("sub_type_id", sa.Integer(), nullable=True),
        sa.Column("sub_type_desc", sa.String(), nullable=True),
        sa.Column("status_id", sa.Integer(), nullable=True),
        sa.Column("private_number", sa.Integer(), nullable=True),
        sa.Column("publication_date", sa.Date(), nullable=True),
        sa.Column("is_continuation", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("summary_law", sa.Text(), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("bill_id"),
    )
    op.create_index("ix_bills_knesset_status", "bills", ["knesset_num", "status_id"])
    op.create_index("ix_bills_publication_date", "bills", ["publication_date"])

    # ── bill_initiators ───────────────────────────────────────────────────────
    op.create_table(
        "bill_initiators",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("bill_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.Column("is_initiator", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("ordinal", sa.Integer(), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bill_initiators_bill_id", "bill_initiators", ["bill_id"])
    op.create_index("ix_bill_initiators_person_id", "bill_initiators", ["person_id"])

    # ── vote_headers ──────────────────────────────────────────────────────────
    op.create_table(
        "vote_headers",
        sa.Column("vote_id", sa.Integer(), nullable=False),
        sa.Column("knesset_num", sa.Integer(), nullable=True),
        sa.Column("session_id", sa.Integer(), nullable=True),
        sa.Column("sess_item_dscr", sa.String(), nullable=True),
        sa.Column("vote_item_id", sa.Integer(), nullable=True),
        sa.Column("vote_item_dscr", sa.String(), nullable=True),
        sa.Column("vote_date", sa.Date(), nullable=True),
        sa.Column("vote_time", sa.String(8), nullable=True),
        sa.Column("vote_type", sa.Integer(), nullable=True),
        sa.Column("is_accepted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("total_for", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_against", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_abstain", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("vote_id"),
    )
    op.create_index("ix_vote_headers_knesset_date", "vote_headers", ["knesset_num", "vote_date"])
    op.create_index("ix_vote_headers_vote_date", "vote_headers", ["vote_date"])

    # ── vote_decisions ────────────────────────────────────────────────────────
    op.create_table(
        "vote_decisions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("vote_id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("member_name", sa.String(), nullable=True),
        sa.Column("result", sa.String(10), nullable=False),
        sa.Column("knesset_num", sa.Integer(), nullable=True),
        sa.Column("faction_id", sa.Integer(), nullable=True),
        sa.Column("faction_name", sa.String(), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("vote_id", "member_id", name="uq_vote_decision"),
    )
    op.create_index("ix_vote_decisions_vote_id", "vote_decisions", ["vote_id"])
    op.create_index("ix_vote_decisions_member_id", "vote_decisions", ["member_id"])
    op.create_index("ix_vote_decisions_faction_id", "vote_decisions", ["faction_id"])


def downgrade() -> None:
    op.drop_table("vote_decisions")
    op.drop_table("vote_headers")
    op.drop_table("bill_initiators")
    op.drop_table("bills")
    op.drop_table("factions")
    op.drop_table("member_factions")
    op.drop_table("members")
