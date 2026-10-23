"""Email delivery abstraction. Development mode logs to console; production requires SMTP/API."""
import logging
from typing import Optional

logger = logging.getLogger("voice-integrity-email")


class EmailService:
    def __init__(self, provider: str = "development"):
        self.provider = provider

    def send_verification_email(self, to_email: str, token: str) -> bool:
        if self.provider == "development":
            url = f"http://localhost:5173/verify-email?token={token}"
            logger.info("[DEV EMAIL] To: %s — Verification URL (NOT REAL EMAIL): %s", to_email, url)
            return True
        raise NotImplementedError("Production email provider not configured")

    def send_password_reset_email(self, to_email: str, token: str) -> bool:
        if self.provider == "development":
            url = f"http://localhost:5173/reset-password?token={token}"
            logger.info("[DEV EMAIL] To: %s — Reset URL (NOT REAL EMAIL): %s", to_email, url)
            return True
        raise NotImplementedError("Production email provider not configured")
