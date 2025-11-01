#!/usr/bin/env python
"""CLI tool for testing webhook delivery."""

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime

import httpx


async def test_webhook(url: str, headers: dict | None = None, payload: dict | None = None) -> None:
    """
    Test webhook delivery by sending a test payload.

    Args:
        url: Webhook URL to test
        headers: Optional custom headers
        payload: Optional custom payload
    """
    if payload is None:
        payload = {
            "event": "test",
            "message": "This is a test webhook from Fluxion CLI",
            "timestamp": datetime.now(UTC).isoformat(),
        }

    if headers is None:
        headers = {"Content-Type": "application/json"}
    else:
        headers["Content-Type"] = "application/json"

    print(f"Testing webhook: {url}")
    print(f"Headers: {json.dumps(headers, indent=2)}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    print()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            start_time = asyncio.get_event_loop().time()
            response = await client.post(url, json=payload, headers=headers)
            end_time = asyncio.get_event_loop().time()
            
            duration_ms = int((end_time - start_time) * 1000)

            print(f"✓ Status Code: {response.status_code}")
            print(f"✓ Duration: {duration_ms}ms")
            print(f"✓ Response Body: {response.text[:500]}")
            
            if 200 <= response.status_code < 300:
                print("\n✓ Webhook test PASSED")
                return 0
            else:
                print("\n✗ Webhook test FAILED (non-2xx status code)")
                return 1

    except httpx.TimeoutException:
        print("✗ Webhook test FAILED: Request timeout")
        return 1
    except httpx.RequestError as e:
        print(f"✗ Webhook test FAILED: {str(e)}")
        return 1
    except Exception as e:
        print(f"✗ Webhook test FAILED: Unexpected error: {str(e)}")
        return 1


async def test_ntfy_webhook(topic: str, title: str | None = None, priority: str = "default") -> None:
    """
    Test ntfy.sh webhook delivery.

    Args:
        topic: ntfy.sh topic
        title: Optional message title
        priority: Message priority (default, min, low, high, max)
    """
    url = f"https://ntfy.sh/{topic}"
    
    headers = {
        "Priority": priority,
    }
    
    if title:
        headers["Title"] = title
    else:
        headers["Title"] = "🚨 Fluxion Test"
    
    payload = {
        "event": "test",
        "message": "This is a test webhook from Fluxion CLI",
        "hostname": "test-server",
        "timestamp": datetime.now(UTC).isoformat(),
    }
    
    return await test_webhook(url, headers, payload)


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Test webhook delivery from Fluxion",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Test a generic webhook
  python test_webhook.py --url https://example.com/webhook --payload '{"test": "data"}'
  
  # Test an ntfy.sh webhook
  python test_webhook.py --ntfy my-topic --title "Test Alert" --priority high
  
  # Test with custom headers
  python test_webhook.py --url https://example.com/webhook --headers '{"Authorization": "Bearer token"}'
        """,
    )
    
    parser.add_argument(
        "--url",
        type=str,
        help="Webhook URL to test",
    )
    
    parser.add_argument(
        "--ntfy",
        type=str,
        metavar="TOPIC",
        help="Test ntfy.sh webhook with the specified topic",
    )
    
    parser.add_argument(
        "--headers",
        type=str,
        help="Custom headers as JSON string",
    )
    
    parser.add_argument(
        "--payload",
        type=str,
        help="Custom payload as JSON string",
    )
    
    parser.add_argument(
        "--title",
        type=str,
        help="Title for ntfy.sh notifications",
    )
    
    parser.add_argument(
        "--priority",
        type=str,
        default="default",
        choices=["min", "low", "default", "high", "max"],
        help="Priority for ntfy.sh notifications (default: default)",
    )
    
    args = parser.parse_args()
    
    # Validate arguments
    if not args.url and not args.ntfy:
        parser.error("Either --url or --ntfy must be specified")
    
    if args.url and args.ntfy:
        parser.error("Cannot specify both --url and --ntfy")
    
    # Parse headers if provided
    headers = None
    if args.headers:
        try:
            headers = json.loads(args.headers)
        except json.JSONDecodeError:
            print("Error: Invalid JSON for --headers")
            return 1
    
    # Parse payload if provided
    payload = None
    if args.payload:
        try:
            payload = json.loads(args.payload)
        except json.JSONDecodeError:
            print("Error: Invalid JSON for --payload")
            return 1
    
    # Run test
    try:
        if args.ntfy:
            result = asyncio.run(test_ntfy_webhook(args.ntfy, args.title, args.priority))
        else:
            result = asyncio.run(test_webhook(args.url, headers, payload))
        
        return result if result is not None else 0
        
    except KeyboardInterrupt:
        print("\nTest cancelled by user")
        return 130


if __name__ == "__main__":
    sys.exit(main())
