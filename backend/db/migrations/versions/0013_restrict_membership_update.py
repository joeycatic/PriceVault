"""Restrict invite acceptance to the accepted membership column.

Revision ID: 0013_restrict_membership_update
Revises: 0012_accepted_membership_data_scope
Create Date: 2026-07-01
"""

from alembic import op


revision = "0013_restrict_membership_update"
down_revision = "0012_accepted_membership_data_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        revoke update on public.team_members from authenticated;
        grant update (accepted) on public.team_members to authenticated;
        notify pgrst, 'reload schema';
        """
    )


def downgrade() -> None:
    op.execute(
        """
        revoke update (accepted) on public.team_members from authenticated;
        grant update on public.team_members to authenticated;
        notify pgrst, 'reload schema';
        """
    )
