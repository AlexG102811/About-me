"""Regression tests for contact-message storage and authenticated inbox routes."""

from __future__ import annotations

import http.client
import json
import os
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode
from unittest.mock import patch


# Import the server with a test-only value so test discovery does not depend on
# or expose the workspace's configured session secret.
with patch.dict(os.environ, {"SESSION_SECRET": "contact-inbox-tests-only"}):
    import server


class FakeObjectStorage:
    """In-memory substitute for the App Storage client used by each test."""

    def __init__(self, contents: str | None = None) -> None:
        self.contents = contents
        self.download_error: Exception | None = None
        self.upload_error: Exception | None = None

    def download_as_text(self, _object_name: str) -> str:
        if self.download_error:
            raise self.download_error
        if self.contents is None:
            raise server.ObjectNotFoundError
        return self.contents

    def upload_from_text(self, _object_name: str, contents: str) -> None:
        if self.upload_error:
            raise self.upload_error
        self.contents = contents


class ContactInboxTests(unittest.TestCase):
    def setUp(self) -> None:
        self.storage = FakeObjectStorage()
        self.storage_client_patch = patch.object(server, "Client", return_value=self.storage)
        self.storage_client_patch.start()
        self.addCleanup(self.storage_client_patch.stop)

        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.legacy_path = Path(self.temp_dir.name) / ".site-messages.json"
        self.legacy_path_patch = patch.object(server, "MESSAGES_PATH", self.legacy_path)
        self.legacy_path_patch.start()
        self.addCleanup(self.legacy_path_patch.stop)

        server.sessions.clear()
        self.session_token = "contact-inbox-test-session"
        server.sessions[self.session_token] = server.time.time() + 60

        def handler(*args, **kwargs):
            return server.SiteHandler(*args, directory=str(server.ROOT), **kwargs)

        self.http_server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.http_server.daemon_threads = True
        self.http_thread = threading.Thread(target=self.http_server.serve_forever, daemon=True)
        self.http_thread.start()
        self.addCleanup(self.stop_http_server)

    def stop_http_server(self) -> None:
        self.http_server.shutdown()
        self.http_server.server_close()
        self.http_thread.join(timeout=2)

    def request(
        self,
        method: str,
        path: str,
        *,
        body: str | None = None,
        authenticated: bool = False,
    ) -> tuple[int, dict]:
        headers = {"Accept": "application/json"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if authenticated:
            headers["Cookie"] = f"{server.SESSION_COOKIE}={self.session_token}"

        connection = http.client.HTTPConnection("127.0.0.1", self.http_server.server_port, timeout=3)
        try:
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            return response.status, json.loads(response.read().decode("utf-8"))
        finally:
            connection.close()

    @staticmethod
    def record(**overrides: object) -> dict:
        message = {
            "id": "message-1",
            "name": "Avery",
            "email": "avery@example.com",
            "reason": "General",
            "message": "Hello",
            "submittedAt": "2026-09-26T12:00:00+00:00",
            "read": False,
            "status": "new",
            "repliedAt": None,
        }
        message.update(overrides)
        return message

    def test_legacy_migration_preserves_source_and_normalizes_records(self) -> None:
        legacy_records = [
            {
                "id": "legacy-1",
                "name": "Avery",
                "email": "avery@example.com",
                "message": "Saved before migration",
                "receivedAt": "2025-12-01T09:00:00+00:00",
                "reason": "Retired topic",
                "replied": True,
            }
        ]
        self.legacy_path.write_text(json.dumps(legacy_records), encoding="utf-8")
        source_before = self.legacy_path.read_bytes()

        messages = server.load_messages()

        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["reason"], "Other")
        self.assertEqual(messages[0]["submittedAt"], "2025-12-01T09:00:00+00:00")
        self.assertEqual(messages[0]["status"], "replied")
        self.assertIsNone(messages[0]["repliedAt"])
        self.assertEqual(self.legacy_path.read_bytes(), source_before)
        self.assertEqual(json.loads(self.storage.contents or "null"), messages)

    def test_normalization_maps_legacy_status_and_unknown_reason(self) -> None:
        normalized = server.normalize_message(
            self.record(reason="Unrecognized", status="new", replied=True)
        )

        self.assertEqual(normalized["reason"], "Other")
        self.assertEqual(normalized["status"], "replied")
        self.assertIsNone(normalized["repliedAt"])

    def test_authenticated_list_and_read_reply_updates(self) -> None:
        self.storage.contents = json.dumps([self.record()])

        status, payload = self.request("GET", "/api/messages", authenticated=True)
        self.assertEqual(status, 200)
        self.assertEqual(payload["messages"][0]["id"], "message-1")

        status, payload = self.request(
            "POST",
            "/api/messages/message-1/read",
            body=json.dumps({"read": True}),
            authenticated=True,
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload["message"]["read"])

        status, payload = self.request(
            "POST",
            "/api/messages/message-1/reply",
            body=json.dumps({"status": "replied"}),
            authenticated=True,
        )
        self.assertEqual(status, 200)
        self.assertEqual(payload["message"]["status"], "replied")
        self.assertTrue(payload["message"]["repliedAt"])

        saved = json.loads(self.storage.contents or "null")[0]
        self.assertTrue(saved["read"])
        self.assertEqual(saved["status"], "replied")

        status, payload = self.request(
            "POST",
            "/api/messages/message-1/reply",
            body=json.dumps({"status": "new"}),
            authenticated=True,
        )
        self.assertEqual(status, 200)
        self.assertIsNone(payload["message"]["repliedAt"])

    def test_message_list_and_updates_require_authentication(self) -> None:
        status, payload = self.request("GET", "/api/messages")
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"], "Authentication required.")

        status, payload = self.request(
            "POST",
            "/api/messages/message-1/read",
            body=json.dumps({"read": True}),
        )
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"], "Authentication required.")

    def test_storage_outages_return_errors_and_never_report_delivery(self) -> None:
        self.storage.download_error = RuntimeError("storage offline")
        status, payload = self.request("GET", "/api/messages", authenticated=True)
        self.assertEqual(status, 503)
        self.assertIn("unavailable", payload["error"].lower())

        # Reads work, but the actual submission cannot be persisted.
        self.storage.download_error = None
        self.storage.contents = "[]"
        self.storage.upload_error = RuntimeError("write unavailable")
        form = urlencode(
            {
                "name": "Avery",
                "email": "avery@example.com",
                "reason": "General",
                "message": "Please do not lose this message.",
            }
        )
        headers = {"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"}
        connection = http.client.HTTPConnection("127.0.0.1", self.http_server.server_port, timeout=3)
        try:
            connection.request("POST", "/messages", body=form, headers=headers)
            response = connection.getresponse()
            payload = json.loads(response.read().decode("utf-8"))
            self.assertEqual(response.status, 503)
            self.assertNotIn("ok", payload)
            self.assertIn("could not be saved", payload["error"].lower())
        finally:
            connection.close()

    def test_malformed_stored_data_returns_clear_failures(self) -> None:
        for malformed_contents in ("{", "{}", '[{"id":"incomplete"}]'):
            with self.subTest(contents=malformed_contents):
                self.storage.contents = malformed_contents
                status, payload = self.request("GET", "/api/messages", authenticated=True)
                self.assertEqual(status, 500)
                self.assertIn("invalid data", payload["error"].lower())

        self.storage.contents = "{"
        form = urlencode(
            {
                "name": "Avery",
                "email": "avery@example.com",
                "reason": "General",
                "message": "This must not be reported as delivered.",
            }
        )
        headers = {"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"}
        connection = http.client.HTTPConnection("127.0.0.1", self.http_server.server_port, timeout=3)
        try:
            connection.request("POST", "/messages", body=form, headers=headers)
            response = connection.getresponse()
            payload = json.loads(response.read().decode("utf-8"))
            self.assertEqual(response.status, 500)
            self.assertNotIn("ok", payload)
            self.assertIn("could not be saved", payload["error"].lower())
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main()