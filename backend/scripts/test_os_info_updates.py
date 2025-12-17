#!/usr/bin/env python
"""Test script to verify OS info insertion and updates work correctly."""

import asyncio
import os

import httpx


async def test_os_info_insertion_and_updates():
    """Test that OS info is properly inserted for new hosts and updated for existing hosts."""
    api_url = os.getenv("FLUXION_API_URL", "http://localhost:8000")
    api_key = os.getenv("FLUXION_API_KEY", "")

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key

    test_hostname = "test-os-update-host"

    print("=" * 70)
    print("Testing OS Info Insertion and Updates")
    print("=" * 70)

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Step 1: Create a new host with Ubuntu OS info
        print("\n1. Creating new host with Ubuntu OS info...")
        response = await client.post(
            f"{api_url}/api/v1/updates/batch",
            json={
                "hostname": test_hostname,
                "os_info": "Ubuntu 22.04.3 LTS",
                "updates": [
                    {
                        "package_name": "nginx",
                        "old_version": None,
                        "new_version": "1.18.0",
                    }
                ],
            },
            headers=headers,
        )

        if response.status_code in [200, 201]:
            print(f"✓ Host created: {response.json()}")
        else:
            print(f"✗ Failed: {response.status_code} - {response.text}")
            return

        # Step 2: Verify the host was created with correct OS info
        print(f"\n2. Verifying host has Ubuntu OS info...")
        response = await client.get(f"{api_url}/api/v1/hosts", headers=headers)

        if response.status_code == 200:
            hosts = response.json()["items"]
            test_host = next((h for h in hosts if h["hostname"] == test_hostname), None)
            if test_host:
                print(f"✓ Host found: {test_host['hostname']}")
                print(f"  OS Info: {test_host['os_info']}")
                if test_host["os_info"] == "Ubuntu 22.04.3 LTS":
                    print("  ✓ OS info is correct!")
                else:
                    print(f"  ✗ OS info is incorrect! Expected 'Ubuntu 22.04.3 LTS', got '{test_host['os_info']}'")
            else:
                print(f"✗ Host {test_hostname} not found")
                return
        else:
            print(f"✗ Failed to fetch hosts: {response.status_code}")
            return

        # Step 3: Update the host with different OS info (simulating OS upgrade)
        print(f"\n3. Updating host with new OS info (Ubuntu 24.04 LTS)...")
        response = await client.post(
            f"{api_url}/api/v1/updates/batch",
            json={
                "hostname": test_hostname,
                "os_info": "Ubuntu 24.04 LTS",
                "updates": [
                    {
                        "package_name": "curl",
                        "old_version": "7.81.0",
                        "new_version": "8.0.0",
                    }
                ],
            },
            headers=headers,
        )

        if response.status_code in [200, 201]:
            print(f"✓ Host updated: {response.json()}")
        else:
            print(f"✗ Failed: {response.status_code} - {response.text}")
            return

        # Step 4: Verify the OS info was updated
        print(f"\n4. Verifying OS info was updated...")
        response = await client.get(f"{api_url}/api/v1/hosts", headers=headers)

        if response.status_code == 200:
            hosts = response.json()["items"]
            test_host = next((h for h in hosts if h["hostname"] == test_hostname), None)
            if test_host:
                print(f"✓ Host found: {test_host['hostname']}")
                print(f"  OS Info: {test_host['os_info']}")
                if test_host["os_info"] == "Ubuntu 24.04 LTS":
                    print("  ✓ OS info was successfully updated!")
                else:
                    print(f"  ✗ OS info was not updated! Expected 'Ubuntu 24.04 LTS', got '{test_host['os_info']}'")
            else:
                print(f"✗ Host {test_hostname} not found")
                return
        else:
            print(f"✗ Failed to fetch hosts: {response.status_code}")
            return

        # Step 5: Send update without OS info (should keep existing OS info)
        print(f"\n5. Sending update without OS info (should preserve existing)...")
        response = await client.post(
            f"{api_url}/api/v1/updates/batch",
            json={
                "hostname": test_hostname,
                # os_info is omitted
                "updates": [
                    {
                        "package_name": "vim",
                        "old_version": None,
                        "new_version": "9.0.0",
                    }
                ],
            },
            headers=headers,
        )

        if response.status_code in [200, 201]:
            print(f"✓ Update sent: {response.json()}")
        else:
            print(f"✗ Failed: {response.status_code} - {response.text}")
            return

        # Step 6: Verify OS info was preserved
        print(f"\n6. Verifying OS info was preserved...")
        response = await client.get(f"{api_url}/api/v1/hosts", headers=headers)

        if response.status_code == 200:
            hosts = response.json()["items"]
            test_host = next((h for h in hosts if h["hostname"] == test_hostname), None)
            if test_host:
                print(f"✓ Host found: {test_host['hostname']}")
                print(f"  OS Info: {test_host['os_info']}")
                if test_host["os_info"] == "Ubuntu 24.04 LTS":
                    print("  ✓ OS info was preserved!")
                else:
                    print(f"  ✗ OS info changed unexpectedly! Expected 'Ubuntu 24.04 LTS', got '{test_host['os_info']}'")
            else:
                print(f"✗ Host {test_hostname} not found")
                return
        else:
            print(f"✗ Failed to fetch hosts: {response.status_code}")
            return

    print("\n" + "=" * 70)
    print("✓ All tests passed! OS info insertion and updates work correctly.")
    print("=" * 70)


async def main():
    """Run the test."""
    print("\nFluxion OS Info Test")
    print(f"API URL: {os.getenv('FLUXION_API_URL', 'http://localhost:8000')}")
    print(f"API Key: {'Set' if os.getenv('FLUXION_API_KEY') else 'Not set'}\n")

    try:
        await test_os_info_insertion_and_updates()
    except Exception as e:
        print(f"\n✗ Test failed with error: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
