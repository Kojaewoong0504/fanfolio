import asyncio
from types import SimpleNamespace

from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import AuditLog, Base, Organization, Role, User
from app.routers.admin_partners import create_organization
from app.schemas import OrganizationCreate


def test_partner_creation_persists_parent_before_its_audit_log() -> None:
    async def scenario() -> None:
        engine = create_async_engine("sqlite+aiosqlite://")

        @event.listens_for(engine.sync_engine, "connect")
        def enable_foreign_keys(connection, _) -> None:  # type: ignore[no-untyped-def]
            connection.execute("PRAGMA foreign_keys=ON")

        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as session:
            root_user = User(
                id="user_partner_creator",
                email="root-partner-creator@example.com",
                role=Role.ADMIN,
            )
            session.add(root_user)
            await session.commit()

            context = SimpleNamespace(user=root_user, require_root=lambda: None)
            result = await create_organization(
                OrganizationCreate(name="신규 파트너", slug="new-partner"),
                context,
                session,
            )

            organization = await session.scalar(
                select(Organization).where(Organization.slug == "new-partner")
            )
            audit_log = await session.scalar(
                select(AuditLog).where(AuditLog.entity_id == organization.id)
            )

            assert result["data"]["id"] == organization.id
            assert audit_log.organization_id == organization.id

        await engine.dispose()

    asyncio.run(scenario())
