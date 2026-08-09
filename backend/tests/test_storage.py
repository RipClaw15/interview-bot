import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from langchain_core.messages import AIMessage, HumanMessage

from agent.storage import save_interview, serialize_transcript
from agent.storage import (
    load_interview,
    save_interview,
    serialize_transcript,
)


class TranscriptSerializationTests(unittest.TestCase):
    def test_serializes_supported_interview_roles(self):
        messages = [
            HumanMessage(content="AI in the workplace"),
            AIMessage(content="How do you currently use AI?"),
            HumanMessage(content="I use it to summarize notes."),
        ]

        transcript = serialize_transcript(messages)

        self.assertEqual(transcript[0]["role"], "participant")
        self.assertEqual(transcript[1]["role"], "interviewer")
        self.assertEqual(len(transcript), 3)


class InterviewStorageTests(unittest.TestCase):
    def test_saves_completed_interview_as_json(self):
        messages = [
            AIMessage(content="How do you currently use AI?"),
            HumanMessage(content="I use it to summarize notes."),
        ]

        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            interview_id = save_interview(
                topic="AI in the workplace",
                messages=messages,
                summary="The participant uses AI for meeting notes.",
                data_dir=data_dir,
            )

            output_path = data_dir / f"{interview_id}.json"
            payload = json.loads(output_path.read_text(encoding="utf-8"))

        self.assertEqual(payload["interview_id"], interview_id)
        self.assertEqual(payload["topic"], "AI in the workplace")
        self.assertEqual(len(payload["transcript"]), 2)
        self.assertIn("meeting notes", payload["summary"])

    def test_loads_interview_by_generated_id(self):
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            interview_id = save_interview(
                topic="Remote work",
                messages=[],
                summary="The participant prefers hybrid work.",
                data_dir=data_dir,
            )

            payload = load_interview(interview_id, data_dir=data_dir)

        self.assertEqual(payload["interview_id"], interview_id)
        self.assertEqual(payload["topic"], "Remote work")

    def test_rejects_path_instead_of_interview_id(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "Invalid interview ID"):
                load_interview(
                    "../../.env",
                    data_dir=Path(directory),
                )


if __name__ == "__main__":
    unittest.main()
