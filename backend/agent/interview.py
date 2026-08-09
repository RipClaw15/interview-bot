from typing import Literal, Sequence

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from .prompts import INTERVIEW_QUESTION_PROMPT, INTERVIEW_SUMMARY_PROMPT
from .state import MAX_INTERVIEW_QUESTIONS


InterviewAction = Literal["question", "summary"]


def format_history(messages: Sequence[BaseMessage]) -> str:
    """Format the messages as a readable interview transcript."""
    lines = []

    for message in messages:
        if isinstance(message, HumanMessage):
            role = "Participant"
        elif isinstance(message, AIMessage):
            role = "Interviewer"
        else:
            continue

        lines.append(f"{role}: {message.content}")

    return "\n".join(lines) or "No previous questions or answers."


def get_next_interview_action(
    current_question_number: int,
) -> tuple[InterviewAction, int]:
    """Choose whether to ask the next question or create the summary."""
    if not 0 <= current_question_number <= MAX_INTERVIEW_QUESTIONS:
        raise ValueError("Question number is outside the interview range.")

    if current_question_number == MAX_INTERVIEW_QUESTIONS:
        return "summary", current_question_number

    return "question", current_question_number + 1


def build_question_prompt(
    topic: str,
    question_number: int,
    messages: Sequence[BaseMessage],
    cv_context: str = "",
) -> str:
    """Build the Groq prompt for one interview question."""
    if not 1 <= question_number <= MAX_INTERVIEW_QUESTIONS:
        raise ValueError("Question number is outside the interview range.")

    return INTERVIEW_QUESTION_PROMPT.format(
        topic=topic,
        question_number=question_number,
        total_questions=MAX_INTERVIEW_QUESTIONS,
        history_text=format_history(messages),
        cv_context=cv_context or "No CV was uploaded.",
    )


def build_summary_prompt(
    topic: str,
    messages: Sequence[BaseMessage],
) -> str:
    """Build the Groq prompt used after the final answer."""
    return INTERVIEW_SUMMARY_PROMPT.format(
        topic=topic,
        history_text=format_history(messages),
    )