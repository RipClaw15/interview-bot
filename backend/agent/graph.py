import json

from langchain_core.messages import HumanMessage
from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field, StrictBool, ValidationError

from .llm import get_llm
from .prompts import ASSESS_UNDERSTANDING_PROMPT, EXTRACT_TOPIC_PROMPT
from .state import TutorState


class AssessmentResult(BaseModel):
    resolved: StrictBool
    hint_level: int = Field(ge=0, le=3)
    misconception: str = Field(default="", max_length=500)


def parse_assessment_result(raw: str) -> AssessmentResult:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].strip().lower() in {"```", "```json"}:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    return AssessmentResult.model_validate(json.loads(cleaned))


async def extract_topic_node(state: TutorState) -> dict:
    user_messages = [m for m in state["messages"] if isinstance(m, HumanMessage)]
    latest_message = user_messages[-1].content

    current_topic = state["topic"] or "unknown"
    prompt = EXTRACT_TOPIC_PROMPT.format(
        current_topic=current_topic,
        latest_message=latest_message,
    )

    response = await state["llm"].ainvoke([HumanMessage(content=prompt)])
    result = response.content.strip()
    if result.lower() == "same":
        return {}

    topic = result.lower()
    if topic in ["unknown", "none", "no topic", "not mentioned"]:
        if current_topic != "unknown":
            return {}
        return {
            "topic": "unknown",
            "hint_level": 0,
            "misconception": "",
            "resolved": False,
        }

    if topic == current_topic.lower():
        return {}

    return {
        "topic": topic,
        "hint_level": 0,
        "misconception": "",
        "resolved": False,
        "topic_changed": True,
    }


async def assess_understanding_node(state: TutorState) -> dict:
    if state.get("topic_changed", False):
        return {"hint_level": 0, "misconception": "", "resolved": False}

    if state["topic"] == "unknown":
        return {"hint_level": 0, "misconception": "", "resolved": False}

    if len(state["messages"]) < 2:
        return {"hint_level": 0, "misconception": "", "resolved": False}

    history_text = "\n".join(
        f"{'User' if isinstance(m, HumanMessage) else 'Tutor'}: {m.content}"
        for m in state["messages"]
    )
    prompt = ASSESS_UNDERSTANDING_PROMPT.format(
        topic=state["topic"],
        history_text=history_text,
        hint_level=state["hint_level"],
    )

    response = await state["llm"].ainvoke([HumanMessage(content=prompt)])

    try:
        assessment = parse_assessment_result(response.content)

        if assessment.resolved:
            return {
                "resolved": True,
                "hint_level": 0,
                "misconception": "",
            }

        return {
            "resolved": False,
            "hint_level": max(state["hint_level"], assessment.hint_level),
            "misconception": assessment.misconception,
        }
    except (json.JSONDecodeError, TypeError, ValidationError, ValueError):
        return {
            "resolved": False,
            "hint_level": state["hint_level"],
            "misconception": state["misconception"],
        }

def build_assessment_graph() -> StateGraph:
    workflow = StateGraph(TutorState)

    workflow.add_node("extract_topic", extract_topic_node)
    workflow.add_node("assess_understanding", assess_understanding_node)

    workflow.set_entry_point("extract_topic")
    workflow.add_edge("extract_topic", "assess_understanding")
    workflow.add_edge("assess_understanding", END)

    return workflow.compile()

assessment_graph = build_assessment_graph()
