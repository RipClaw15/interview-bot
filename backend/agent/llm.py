import os

from dotenv import load_dotenv
from langchain_groq import ChatGroq


load_dotenv()

DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b"


def get_llm(provider: str | None = None) -> ChatGroq:
    """Create the Groq model used by the interviewer."""
    if provider not in {None, "groq"}:
        raise ValueError("Only the Groq provider is supported.")

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError(
            "GROQ_API_KEY is not configured. Add it to backend/.env "
            "and restart the backend."
        )

    model = os.getenv("GROQ_MODEL", DEFAULT_GROQ_MODEL)

    return ChatGroq(
        model=model,
        temperature=0.4,
        groq_api_key=api_key,
    )
