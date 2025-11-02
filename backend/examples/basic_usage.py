"""Example usage of Fluxion database models."""

import asyncio
from datetime import UTC, datetime

from sqlalchemy import select

from fluxion.database import get_session
from fluxion.models import Host, PackageUpdate


async def create_host_example():
    """Example: Create a new host."""
    async for session in get_session():
        host = Host(
            hostname="server01.example.com",
            os_info="Ubuntu 22.04.3 LTS",
            last_seen=datetime.now(UTC),
        )
        session.add(host)
        await session.commit()
        print(f"Created host: {host}")
        return host.id


async def add_package_update_example(host_id: int):
    """Example: Add a package update."""
    async for session in get_session():
        update = PackageUpdate(
            host_id=host_id,
            package_name="nginx",
            old_version="1.18.0-0ubuntu1.4",
            new_version="1.18.0-0ubuntu1.5",
            update_timestamp=datetime.now(UTC),
        )
        session.add(update)
        await session.commit()
        print(f"Added package update: {update}")


async def query_hosts_example():
    """Example: Query all hosts."""
    async for session in get_session():
        result = await session.execute(select(Host))
        hosts = result.scalars().all()
        print(f"\nFound {len(hosts)} hosts:")
        for host in hosts:
            print(f"  - {host.hostname} (OS: {host.os_info})")
        return hosts


async def query_package_updates_example(package_name: str):
    """Example: Query updates for a specific package."""
    async for session in get_session():
        result = await session.execute(
            select(PackageUpdate)
            .where(PackageUpdate.package_name == package_name)
            .order_by(PackageUpdate.update_timestamp.desc())
        )
        updates = result.scalars().all()
        print(f"\nFound {len(updates)} updates for {package_name}:")
        for update in updates:
            print(
                f"  - {update.old_version} -> {update.new_version} "
                f"at {update.update_timestamp}"
            )
        return updates


async def main():
    """Run example usage."""
    print("=== Fluxion Database Examples ===\n")

    # Note: This requires a running PostgreSQL database
    # Set DATABASE_URL environment variable before running

    try:
        # Create a host
        print("1. Creating a host...")
        host_id = await create_host_example()

        # Add some package updates
        print("\n2. Adding package updates...")
        await add_package_update_example(host_id)

        # Query hosts
        print("\n3. Querying hosts...")
        await query_hosts_example()

        # Query package updates
        print("\n4. Querying package updates...")
        await query_package_updates_example("nginx")

        print("\n=== Examples completed successfully ===")
    except Exception as e:
        print(f"\nError: {e}")
        print("\nMake sure to:")
        print("1. Set DATABASE_URL environment variable")
        print("2. Run database migrations: alembic upgrade head")
        print("3. Ensure PostgreSQL is running")


if __name__ == "__main__":
    asyncio.run(main())
