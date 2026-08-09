from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Sequence
import uuid

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage


DEFAULT_INTERVIEW_DATA_DIR = (
    Path(__file__).resolve().parents[1] / "data" / "interviews"
)


def serialize_transcript(
    messages: Sequence[BaseMessage],
) -> list[dict[str, str]]:
    """Convert LangChain messages into JSON-compatible transcript entries."""
    transcript = []

    for message in messages:
        if isinstance(message, HumanMessage):
            role = "participant"
        elif isinstance(message, AIMessage):
            role = "interviewer"
        else:
            continue

        transcript.append(
            {
                "role": role,
                "content": str(message.content),
            }
        )

    return transcript


def save_interview(
    topic: str,
    messages: Sequence[BaseMessage],
    summary: str,
    data_dir: Path | None = None,
) -> str:
    """Save a completed interview and return its generated ID."""
    if data_dir is None:
        configured_dir = os.getenv("INTERVIEW_DATA_DIR")
        data_dir = (
            Path(configured_dir)
            if configured_dir
            else DEFAULT_INTERVIEW_DATA_DIR
        )

    data_dir.mkdir(parents=True, exist_ok=True)

    interview_id = str(uuid.uuid4())
    final_path = data_dir / f"{interview_id}.json"
    temporary_path = data_dir / f".{interview_id}.tmp"

    payload = {
        "version": 1,
        "interview_id": interview_id,
        "topic": topic,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "transcript": serialize_transcript(messages),
        "summary": summary,
    }

    temporary_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    temporary_path.replace(final_path)

    return interview_id



def load_interview(
    interview_id: str,
    data_dir: Path | None = None,
) -> dict:
    """Load an interview by UUID without accepting arbitrary paths."""
    try:
        normalized_id = str(uuid.UUID(interview_id))
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError("Invalid interview ID.") from exc

    if data_dir is None:
        configured_dir = os.getenv("INTERVIEW_DATA_DIR")
        data_dir = (
            Path(configured_dir)
            if configured_dir
            else DEFAULT_INTERVIEW_DATA_DIR
        )

    interview_path = data_dir / f"{normalized_id}.json"

    if not interview_path.is_file():
        raise FileNotFoundError("Interview not found.")

    payload = json.loads(interview_path.read_text(encoding="utf-8"))

    if payload.get("interview_id") != normalized_id:
        raise ValueError("Stored interview ID does not match its filename.")

    return payload
