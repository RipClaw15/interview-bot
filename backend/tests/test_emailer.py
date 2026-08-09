import base64
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from langchain_core.messages import HumanMessage

from agent.emailer import send_interview_email
from agent.storage import save_interview


class InterviewEmailTests(unittest.TestCase):
    @patch("agent.emailer.resend.Emails.send")
    def test_sends_json_attachment(self, mock_send):
        mock_send.return_value = {"id": "email_123"}

        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            interview_id = save_interview(
                topic="AI in the workplace",
                messages=[
                    HumanMessage(content="I use AI to summarize notes.")
                ],
                summary="The participant uses AI for repetitive work.",
                data_dir=data_dir,
            )

            with patch.dict(
                os.environ,
                {
                    "RESEND_API_KEY": "re_test_key",
                    "EMAIL_FROM": "Interviewer <interviews@example.com>",
                },
            ):
                email_id = send_interview_email(
                    interview_id=interview_id,
                    recipient="candidate@example.com",
                    data_dir=data_dir,
                )

        self.assertEqual(email_id, "email_123")

        params = mock_send.call_args.args[0]
        options = mock_send.call_args.kwargs["options"]

        self.assertEqual(params["to"], ["candidate@example.com"])
        self.assertEqual(
            params["from"],
            "Interviewer <interviews@example.com>",
        )
        self.assertIn(interview_id, options["idempotency_key"])

        attachment = params["attachments"][0]
        decoded = base64.b64decode(attachment["content"])
        payload = json.loads(decoded.decode("utf-8"))

        self.assertEqual(payload["interview_id"], interview_id)
        self.assertIn("repetitive work", payload["summary"])

    def test_requires_resend_api_key(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "RESEND_API_KEY"):
                send_interview_email(
                    interview_id="00000000-0000-0000-0000-000000000000",
                    recipient="candidate@example.com",
                )


if __name__ == "__main__":
    unittest.main()