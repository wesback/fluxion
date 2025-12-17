#!/usr/bin/env python
"""Example of sending package updates with OS information to Fluxion API."""

import asyncio
import os
from datetime import UTC, datetime

import httpx


async def send_single_update():
    """Example: Send a single package update with OS information."""
    api_url = os.getenv("FLUXION_API_URL", "http://localhost:8000")
    api_key = os.getenv("FLUXION_API_KEY", "")

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key

    payload = {
        "hostname": "web-server-01.example.com",
        "os_info": "Ubuntu 22.04.3 LTS",  # OS information is now included
        "package_name": "nginx",
        "old_version": "1.18.0-6ubuntu14.4",
        "new_version": "1.18.0-6ubuntu14.5",
    }

    print("Sending single package update with OS info...")
    print(f"URL: {api_url}/api/v1/updates")
    print(f"Payload: {payload}\n")

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{api_url}/api/v1/updates",
                json=payload,
                headers=headers,
                timeout=10.0,
            )
            response.raise_for_status()
            print(f"✓ Success: {response.json()}\n")
            return response.json()
        except httpx.HTTPStatusError as e:
            print(f"✗ HTTP Error: {e.response.status_code} - {e.response.text}\n")
        except Exception as e:
            print(f"✗ Error: {str(e)}\n")


async def send_batch_updates():
    """Example: Send multiple package updates with OS information in a batch."""
    api_url = os.getenv("FLUXION_API_URL", "http://localhost:8000")
    api_key = os.getenv("FLUXION_API_KEY", "")

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key

    payload = {
        "hostname": "db-server-01.example.com",
        "os_info": "Debian 12 (bookworm)",  # OS information is now included
        "updates": [
            {
                "package_name": "postgresql-14",
                "old_version": "14.9-0ubuntu0.22.04.1",
                "new_version": "14.10-0ubuntu0.22.04.1",
            },
            {
                "package_name": "curl",
                "old_version": "7.81.0-1ubuntu1.14",
                "new_version": "7.81.0-1ubuntu1.15",
            },
            {
                "package_name": "vim",
                "old_version": None,  # New installation
                "new_version": "8.2.4919-1ubuntu1",
            },
        ],
    }

    print("Sending batch package updates with OS info...")
    print(f"URL: {api_url}/api/v1/updates/batch")
    print(f"Payload: {payload}\n")

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{api_url}/api/v1/updates/batch",
                json=payload,
                headers=headers,
                timeout=10.0,
            )
            response.raise_for_status()
            print(f"✓ Success: {response.json()}\n")
            return response.json()
        except httpx.HTTPStatusError as e:
            print(f"✗ HTTP Error: {e.response.status_code} - {e.response.text}\n")
        except Exception as e:
            print(f"✗ Error: {str(e)}\n")


async def send_update_without_os_info():
    """Example: Send package update without OS info (will default to 'Unknown')."""
    api_url = os.getenv("FLUXION_API_URL", "http://localhost:8000")
    api_key = os.getenv("FLUXION_API_KEY", "")

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key

    payload = {
        "hostname": "legacy-server.example.com",
        # os_info is optional - will default to "Unknown" for new hosts
        "package_name": "openssl",
        "old_version": "1.1.1f-1ubuntu2.19",
        "new_version": "1.1.1f-1ubuntu2.20",
    }

    print("Sending package update WITHOUT OS info (backward compatible)...")
    print(f"URL: {api_url}/api/v1/updates")
    print(f"Payload: {payload}\n")

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{api_url}/api/v1/updates",
                json=payload,
                headers=headers,
                timeout=10.0,
            )
            response.raise_for_status()
            print(f"✓ Success: {response.json()}\n")
            return response.json()
        except httpx.HTTPStatusError as e:
            print(f"✗ HTTP Error: {e.response.status_code} - {e.response.text}\n")
        except Exception as e:
            print(f"✗ Error: {str(e)}\n")


async def main():
    """Run all examples."""
    print("=== Fluxion API Examples - OS Information ===\n")
    print("This demonstrates sending package updates with OS information.\n")
    print("Configuration:")
    print(f"  API URL: {os.getenv('FLUXION_API_URL', 'http://localhost:8000')}")
    print(f"  API Key: {'Set' if os.getenv('FLUXION_API_KEY') else 'Not set'}\n")
    print("=" * 60 + "\n")

    # Example 1: Single update with OS info
    await send_single_update()

    # Example 2: Batch updates with OS info
    await send_batch_updates()

    # Example 3: Update without OS info (backward compatible)
    await send_update_without_os_info()

    print("=" * 60)
    print("\nAll examples completed!")
    print("\nNotes:")
    print("  - os_info is optional for backward compatibility")
    print("  - New hosts without os_info will be created with 'Unknown'")
    print("  - Existing hosts will have their os_info updated if provided")
    print("  - OS detection is automatic in the APT hook script")


if __name__ == "__main__":
    asyncio.run(main())
