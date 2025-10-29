#!/usr/bin/env python3
"""CLI script to generate an initial admin API key."""

import asyncio
import sys

from sqlalchemy import select

from fluxion.auth import generate_api_key, hash_api_key
from fluxion.database import get_session
from fluxion.models import APIKey


async def create_admin_key(name: str = "Initial Admin Key") -> tuple[int, str]:
    """
    Create an admin API key.

    Args:
        name: Name for the API key

    Returns:
        Tuple of (key_id, api_key)
    """
    async for session in get_session():
        # Check if any admin keys already exist
        stmt = select(APIKey).where(APIKey.role == "admin", APIKey.is_active == True)
        result = await session.execute(stmt)
        existing_keys = result.scalars().all()

        if existing_keys:
            print(f"\n⚠️  Warning: {len(existing_keys)} active admin key(s) already exist:")
            for key in existing_keys:
                print(f"  - {key.name} (ID: {key.id}, Created: {key.created_at})")
            
            # Ask for confirmation
            response = input("\nDo you want to create another admin key? (y/N): ")
            if response.lower() != 'y':
                print("Operation cancelled.")
                sys.exit(0)

        # Generate API key
        api_key = generate_api_key()
        key_hash = hash_api_key(api_key)

        # Create API key record
        api_key_obj = APIKey(
            name=name,
            key_hash=key_hash,
            role="admin",
            is_active=True,
        )
        session.add(api_key_obj)
        await session.commit()
        await session.refresh(api_key_obj)

        return api_key_obj.id, api_key


async def main():
    """Main function."""
    print("=" * 70)
    print("Fluxion API Key Generator - Admin Key Creation")
    print("=" * 70)
    print()

    # Get key name from user
    name = input("Enter a name for this admin key (default: 'Initial Admin Key'): ").strip()
    if not name:
        name = "Initial Admin Key"

    try:
        key_id, api_key = await create_admin_key(name)

        print()
        print("=" * 70)
        print("✅ Admin API Key Created Successfully!")
        print("=" * 70)
        print()
        print(f"Key ID:   {key_id}")
        print(f"Key Name: {name}")
        print(f"Role:     admin")
        print()
        print("API Key:")
        print("-" * 70)
        print(api_key)
        print("-" * 70)
        print()
        print("⚠️  IMPORTANT: Save this API key securely!")
        print("   This is the ONLY time you will see this key.")
        print("   It cannot be retrieved later.")
        print()
        print("To use this key, include it in the X-API-Key header:")
        print(f"  curl -H 'X-API-Key: {api_key}' http://localhost:8000/api/v1/stats")
        print()
        print("=" * 70)

    except Exception as e:
        print()
        print(f"❌ Error creating admin key: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
