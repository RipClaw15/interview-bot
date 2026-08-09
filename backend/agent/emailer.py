import base64
import hashlib
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from email_validator import EmailNotValidError, validate_email
import resend

from .storage import load_interview


load_dotenv()

class EmailConfigurationError(RuntimeError):
    """Raised when email delivery is not configured correctly."""

def send_interview_email(
    interview_id: str,
    recipient: str,
    data_dir: Path | None = None,
) -> str:
    """Email a saved interview to the requested recipient."""
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        raise EmailConfigurationError(
            "RESEND_API_KEY is not configured."
        )

    sender = os.getenv("EMAIL_FROM", "").strip()
    if not sender:
        raise EmailConfigurationError(
            "EMAIL_FROM is not configured."
        )

    try:
        normalized_recipient = validate_email(
            recipient,
            check_deliverability=False,
        ).normalized
    except EmailNotValidError as exc:
        raise ValueError("Recipient email is invalid.") from exc

    payload = load_interview(interview_id, data_dir=data_dir)

    topic = str(payload.get("topic", "AI interview"))
    summary = str(payload.get("summary", ""))

    json_content = json.dumps(
        payload,
        indent=2,
        ensure_ascii=False,
    ).encode("utf-8")

    encoded_attachment = base64.b64encode(json_content).decode("ascii")

    resend.api_key = api_key

    params: resend.Emails.SendParams = {
        "from": sender,
        "to": [normalized_recipient],
        "subject": f"Your AI interview summary: {topic}",
        "text": (
            "Your AI interview is complete.\n\n"
            f"{summary}\n\n"
            "The attached JSON file contains the transcript and summary."
        ),
        "attachments": [
            {
                "filename": f"interview-{interview_id}.json",
                "content": encoded_attachment,
                "content_type": "application/json",
            }
        ],
    }

    recipient_hash = hashlib.sha256(
        normalized_recipient.lower().encode("utf-8")
    ).hexdigest()[:16]

    response = resend.Emails.send(
        params,
        options={
            "idempotency_key": (
                f"interview-{interview_id}-{recipient_hash}"
            )
        },
    )

    return response["id"]