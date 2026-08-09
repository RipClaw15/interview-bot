from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from langchain_core.messages import AIMessage, HumanMessage

from agent.interview import (
    build_question_prompt,
    build_summary_prompt,
    format_history,
    get_next_interview_action,
)


class InterviewActionTests(unittest.TestCase):
    def test_starts_with_question_one(self):
        action, question_number = get_next_interview_action(0)

        self.assertEqual(action, "question")
        self.assertEqual(question_number, 1)

    def test_summarizes_after_question_four(self):
        action, question_number = get_next_interview_action(4)

        self.assertEqual(action, "summary")
        self.assertEqual(question_number, 4)

    def test_rejects_invalid_question_number(self):
        with self.assertRaises(ValueError):
            get_next_interview_action(5)


class InterviewPromptTests(unittest.TestCase):
    def setUp(self):
        self.messages = [
            HumanMessage(content="I use AI for repetitive work."),
            AIMessage(content="Can you give a specific example?"),
            HumanMessage(content="I use it to summarize meeting notes."),
        ]

    def test_formats_interview_history(self):
        result = format_history(self.messages)

        self.assertIn("Participant: I use AI for repetitive work.", result)
        self.assertIn("Interviewer: Can you give a specific example?", result)

    def test_builds_numbered_question_prompt_with_cv_context(self):
        result = build_question_prompt(
            topic="AI in the workplace",
            question_number=2,
            messages=self.messages,
            cv_context="The participant worked as a software engineer.",
        )

        self.assertIn("Question number: 2 of 4", result)
        self.assertIn("software engineer", result)
        self.assertIn("meeting notes", result)

    def test_builds_summary_prompt(self):
        result = build_summary_prompt(
            topic="AI in the workplace",
            messages=self.messages,
        )

        self.assertIn("Interview topic: AI in the workplace", result)
        self.assertIn("## Interview summary", result)
        self.assertIn("meeting notes", result)


if __name__ == "__main__":
    unittest.main()