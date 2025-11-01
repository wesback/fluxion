"""Webhook service for sending notifications on package updates."""

import asyncio
import logging
import time
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fluxion.models import WebhookConfig, WebhookDeliveryHistory
from fluxion.telemetry import get_tracer

logger = logging.getLogger(__name__)

# Webhook delivery configuration
WEBHOOK_TIMEOUT = 5.0  # 5 seconds
MAX_RETRIES = 3
INITIAL_BACKOFF = 1.0  # 1 second


def is_kernel_package(package_name: str) -> bool:
    """
    Check if a package is a kernel package.

    Args:
        package_name: Name of the package

    Returns:
        True if the package is a kernel package, False otherwise
    """
    kernel_patterns = ["linux-image", "linux-headers", "linux-modules"]
    return any(package_name.startswith(pattern) for pattern in kernel_patterns)


class WebhookService:
    """Service for managing and delivering webhooks."""

    def __init__(self, session: AsyncSession):
        """
        Initialize webhook service.

        Args:
            session: Database session
        """
        self.session = session

    async def get_webhooks_for_event(self, event_type: str) -> list[WebhookConfig]:
        """
        Get all enabled webhooks for a specific event type.

        Args:
            event_type: Event type to filter by

        Returns:
            List of enabled webhook configurations
        """
        result = await self.session.execute(
            select(WebhookConfig).where(
                WebhookConfig.enabled.is_(True),
            )
        )
        webhooks = result.scalars().all()

        # Filter webhooks that have the event_type in their event_types list
        return [w for w in webhooks if event_type in w.event_types]

    async def send_webhook(
        self,
        webhook_config: WebhookConfig,
        payload: dict,
        event_type: str,
    ) -> tuple[bool, int | None, str | None, str | None]:
        """
        Send a webhook with retry logic and exponential backoff.

        Args:
            webhook_config: Webhook configuration
            payload: Payload to send
            event_type: Event type being sent

        Returns:
            Tuple of (success, status_code, response_body, error_message)
        """
        tracer = get_tracer()

        async with httpx.AsyncClient(timeout=WEBHOOK_TIMEOUT) as client:
            for attempt in range(1, MAX_RETRIES + 1):
                try:
                    # Prepare headers
                    headers = {"Content-Type": "application/json"}
                    if webhook_config.headers_json:
                        headers.update(webhook_config.headers_json)

                    # Create span for webhook delivery
                    if tracer:
                        with tracer.start_as_current_span("webhook_delivery") as span:
                            span.set_attribute("webhook.id", webhook_config.id)
                            span.set_attribute("webhook.name", webhook_config.name)
                            span.set_attribute("webhook.url", webhook_config.url)
                            span.set_attribute("webhook.event_type", event_type)
                            span.set_attribute("webhook.attempt", attempt)

                            result = await self._send_request(
                                client, webhook_config.url, headers, payload, attempt
                            )
                    else:
                        result = await self._send_request(
                            client, webhook_config.url, headers, payload, attempt
                        )

                    success, status_code, response_body, error_message = result

                    # Log delivery history
                    await self._log_delivery(
                        webhook_config.id,
                        event_type,
                        payload,
                        status_code,
                        response_body,
                        error_message,
                        attempt,
                    )

                    if success:
                        logger.info(
                            f"Webhook delivered successfully: webhook_id={webhook_config.id}, "
                            f"attempt={attempt}, status_code={status_code}"
                        )
                        return success, status_code, response_body, error_message

                    # If not successful and not the last attempt, wait before retrying
                    if attempt < MAX_RETRIES:
                        backoff_time = INITIAL_BACKOFF * (2 ** (attempt - 1))
                        logger.warning(
                            f"Webhook delivery failed, retrying in {backoff_time}s: "
                            f"webhook_id={webhook_config.id}, attempt={attempt}/{MAX_RETRIES}"
                        )
                        await asyncio.sleep(backoff_time)

                except Exception as e:
                    error_message = f"Unexpected error: {str(e)}"
                    logger.error(
                        f"Error sending webhook: webhook_id={webhook_config.id}, "
                        f"attempt={attempt}, error={error_message}"
                    )

                    # Log failed delivery
                    await self._log_delivery(
                        webhook_config.id,
                        event_type,
                        payload,
                        None,
                        None,
                        error_message,
                        attempt,
                    )

                    if attempt < MAX_RETRIES:
                        backoff_time = INITIAL_BACKOFF * (2 ** (attempt - 1))
                        await asyncio.sleep(backoff_time)

            # All retries exhausted
            logger.error(
                f"Webhook delivery failed after {MAX_RETRIES} attempts: "
                f"webhook_id={webhook_config.id}"
            )
            return False, None, None, f"Failed after {MAX_RETRIES} attempts"

    async def _send_request(
        self,
        client: httpx.AsyncClient,
        url: str,
        headers: dict,
        payload: dict,
        attempt: int,
    ) -> tuple[bool, int | None, str | None, str | None]:
        """
        Send HTTP request to webhook endpoint.

        Args:
            client: HTTP client
            url: Webhook URL
            headers: Request headers
            payload: Request payload
            attempt: Current attempt number

        Returns:
            Tuple of (success, status_code, response_body, error_message)
        """
        try:
            response = await client.post(url, json=payload, headers=headers)

            # Consider 2xx status codes as success
            success = 200 <= response.status_code < 300
            response_body = response.text[:1000]  # Limit response body size

            return success, response.status_code, response_body, None

        except httpx.TimeoutException:
            return False, None, None, f"Request timeout after {WEBHOOK_TIMEOUT}s"
        except httpx.RequestError as e:
            return False, None, None, f"Request error: {str(e)}"
        except Exception as e:
            return False, None, None, f"Unexpected error: {str(e)}"

    async def _log_delivery(
        self,
        webhook_config_id: int,
        event_type: str,
        payload: dict,
        status_code: int | None,
        response_body: str | None,
        error_message: str | None,
        attempt_number: int,
    ) -> None:
        """
        Log webhook delivery attempt to database.

        Args:
            webhook_config_id: Webhook configuration ID
            event_type: Event type
            payload: Payload sent
            status_code: HTTP status code (if any)
            response_body: Response body (if any)
            error_message: Error message (if any)
            attempt_number: Attempt number
        """
        try:
            history = WebhookDeliveryHistory(
                webhook_config_id=webhook_config_id,
                event_type=event_type,
                payload=payload,
                status_code=status_code,
                response_body=response_body,
                error_message=error_message,
                attempt_number=attempt_number,
                delivered_at=datetime.now(UTC),
            )
            self.session.add(history)
            await self.session.commit()
        except Exception as e:
            logger.error(f"Error logging webhook delivery: {str(e)}")
            # Don't fail the webhook delivery if logging fails
            await self.session.rollback()

    async def trigger_kernel_update_webhooks(
        self,
        hostname: str,
        package_name: str,
        old_version: str | None,
        new_version: str,
    ) -> None:
        """
        Trigger webhooks for kernel update events.

        Args:
            hostname: Host name
            package_name: Package name
            old_version: Old version
            new_version: New version
        """
        # Get webhooks for kernel_update event
        webhooks = await self.get_webhooks_for_event("kernel_update")

        if not webhooks:
            logger.debug("No webhooks configured for kernel_update event")
            return

        # Prepare payload
        payload = {
            "event": "kernel_update",
            "hostname": hostname,
            "package_name": package_name,
            "old_version": old_version or "new install",
            "new_version": new_version,
            "timestamp": datetime.now(UTC).isoformat(),
            "severity": "high",
        }

        # Send webhooks asynchronously (don't block)
        tasks = []
        for webhook in webhooks:
            # Format payload for ntfy.sh if applicable
            webhook_payload = payload.copy()
            if "ntfy.sh" in webhook.url.lower():
                # For ntfy.sh, the message body should be simple text
                webhook_payload["message"] = (
                    f"🚨 Kernel Update: {hostname} - {package_name} "
                    f"({old_version or 'new'} → {new_version})"
                )

            task = self.send_webhook(webhook, webhook_payload, "kernel_update")
            tasks.append(task)

        # Execute all webhook deliveries concurrently
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def test_webhook(
        self,
        webhook_config: WebhookConfig,
        test_payload: dict | None = None,
    ) -> tuple[bool, int | None, str | None, str | None, int]:
        """
        Test a webhook configuration by sending a test payload.

        Args:
            webhook_config: Webhook configuration to test
            test_payload: Optional test payload (uses default if not provided)

        Returns:
            Tuple of (success, status_code, response_body, error_message, delivery_time_ms)
        """
        if test_payload is None:
            test_payload = {
                "event": "test",
                "message": "This is a test webhook from Fluxion",
                "timestamp": datetime.now(UTC).isoformat(),
            }

        start_time = time.time()

        async with httpx.AsyncClient(timeout=WEBHOOK_TIMEOUT) as client:
            headers = {"Content-Type": "application/json"}
            if webhook_config.headers_json:
                headers.update(webhook_config.headers_json)

            try:
                response = await client.post(
                    webhook_config.url,
                    json=test_payload,
                    headers=headers
                )

                delivery_time_ms = int((time.time() - start_time) * 1000)
                success = 200 <= response.status_code < 300
                response_body = response.text[:1000]

                return success, response.status_code, response_body, None, delivery_time_ms

            except httpx.TimeoutException:
                delivery_time_ms = int((time.time() - start_time) * 1000)
                error_msg = f"Request timeout after {WEBHOOK_TIMEOUT}s"
                return False, None, None, error_msg, delivery_time_ms
            except httpx.RequestError as e:
                delivery_time_ms = int((time.time() - start_time) * 1000)
                return False, None, None, f"Request error: {str(e)}", delivery_time_ms
            except Exception as e:
                delivery_time_ms = int((time.time() - start_time) * 1000)
                return False, None, None, f"Unexpected error: {str(e)}", delivery_time_ms
