"""Regression tests for contact-message storage and authenticated inbox routes."""

from __future__ import annotations

import http.client
import json
import os
import shutil
import subprocess
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
        status, _headers, response_body = self.request_raw(
            method,
            path,
            body=body,
            authenticated=authenticated,
        )
        return status, json.loads(response_body.decode("utf-8"))

    def request_raw(
        self,
        method: str,
        path: str,
        *,
        body: str | None = None,
        authenticated: bool = False,
    ) -> tuple[int, dict[str, str], bytes]:
        headers = {"Accept": "application/json"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if authenticated:
            headers["Cookie"] = f"{server.SESSION_COOKIE}={self.session_token}"

        connection = http.client.HTTPConnection("127.0.0.1", self.http_server.server_port, timeout=3)
        try:
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            response_body = response.read()
            response_headers = {name.lower(): value for name, value in response.getheaders()}
            return response.status, response_headers, response_body
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

    def test_backup_requires_authentication_and_exports_stored_content(self) -> None:
        self.storage.contents = json.dumps([self.record()], indent=2)
        stored_content = self.storage.contents.encode("utf-8")

        status, payload = self.request("GET", "/api/messages/backup")
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"], "Authentication required.")

        status, headers, body = self.request_raw(
            "GET",
            "/api/messages/backup",
            authenticated=True,
        )
        self.assertEqual(status, 200)
        backup = json.loads(body.decode("utf-8"))
        self.assertEqual(backup["formatVersion"], server.CONTACT_BACKUP_FORMAT_VERSION)
        self.assertEqual(backup["messageCount"], 1)
        self.assertEqual(backup["messages"], json.loads(stored_content))
        self.assertEqual(
            backup["integrity"],
            {
                "algorithm": "sha256",
                "value": server.contact_backup_integrity(backup["messages"]),
            },
        )
        self.assertIn("attachment; filename=\"contact-inbox-backup-", headers["content-disposition"])
        self.assertEqual(headers["cache-control"], "no-store")

        # Malformed content is preserved byte-for-byte in an integrity-checked envelope.
        for malformed_contents in ("{", "{}"):
            with self.subTest(malformed_contents=malformed_contents):
                self.storage.contents = malformed_contents
                status, _headers, body = self.request_raw(
                    "GET",
                    "/api/messages/backup",
                    authenticated=True,
                )
                self.assertEqual(status, 200)
                raw_backup = json.loads(body.decode("utf-8"))
                self.assertEqual(raw_backup["format"], server.CONTACT_RAW_BACKUP_FORMAT)
                self.assertEqual(raw_backup["formatVersion"], server.CONTACT_RAW_BACKUP_FORMAT_VERSION)
                self.assertEqual(
                    raw_backup["integrity"],
                    {
                        "version": server.CONTACT_RAW_BACKUP_INTEGRITY_VERSION,
                        "algorithm": "sha256",
                        "value": server.contact_raw_backup_integrity(malformed_contents.encode("utf-8")),
                    },
                )
                self.assertEqual(
                    server.decode_contact_raw_backup(raw_backup),
                    malformed_contents.encode("utf-8"),
                )

    def test_malformed_backup_export_preserves_non_utf8_legacy_bytes(self) -> None:
        original_bytes = b"\xff\x00damaged\xfe{"
        self.storage.contents = None
        self.legacy_path.write_bytes(original_bytes)

        status, _headers, body = self.request_raw(
            "GET",
            "/api/messages/backup",
            authenticated=True,
        )

        self.assertEqual(status, 200)
        raw_backup = json.loads(body.decode("utf-8"))
        self.assertEqual(server.decode_contact_raw_backup(raw_backup), original_bytes)

    def test_damaged_backup_extraction_downloads_verified_bytes_without_restoring(self) -> None:
        original_bytes = b"\xff\x00damaged inbox\xfe{"
        existing_inbox = '{"untouched":true}'
        self.storage.contents = existing_inbox
        envelope = server.create_contact_raw_backup(original_bytes).decode("utf-8")

        status, payload = self.request("POST", "/api/messages/extract-raw", body=envelope)
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"], "Authentication required.")

        server.sessions[self.session_token] = server.time.time() - 1
        status, payload = self.request(
            "POST",
            "/api/messages/extract-raw",
            body=envelope,
            authenticated=True,
        )
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"], "Authentication required.")

        server.sessions[self.session_token] = server.time.time() + 60
        status, headers, body = self.request_raw(
            "POST",
            "/api/messages/extract-raw",
            body=envelope,
            authenticated=True,
        )
        self.assertEqual(status, 200)
        self.assertEqual(headers["content-type"], "application/octet-stream")
        self.assertEqual(
            headers["content-disposition"],
            'attachment; filename="contact-inbox-recovered.bin"',
        )
        self.assertEqual(headers["cache-control"], "no-store")
        self.assertEqual(body, original_bytes)
        self.assertEqual(self.storage.contents, existing_inbox)

        regular_backup = server.create_contact_backup([self.record()]).decode("utf-8")
        status, payload = self.request(
            "POST",
            "/api/messages/extract-raw",
            body=regular_backup,
            authenticated=True,
        )
        self.assertEqual(status, 400)
        self.assertIn("damaged-inbox export", payload["error"].lower())
        self.assertEqual(self.storage.contents, existing_inbox)

        status, payload = self.request(
            "POST",
            "/api/messages/restore",
            body=envelope,
            authenticated=True,
        )
        self.assertEqual(status, 400)
        self.assertIn("not a valid message list", payload["error"].lower())
        self.assertEqual(self.storage.contents, existing_inbox)

    def test_damaged_backup_extraction_rejects_invalid_or_altered_integrity(self) -> None:
        original_bytes = b"damaged inbox bytes"
        valid_envelope = json.loads(server.create_contact_raw_backup(original_bytes))
        altered_data = json.loads(json.dumps(valid_envelope))
        altered_data["rawContent"]["data"] += "AA=="
        invalid_digest = json.loads(json.dumps(valid_envelope))
        invalid_digest["integrity"]["value"] = "0" * 64
        existing_inbox = '{"untouched":true}'
        self.storage.contents = existing_inbox

        for label, envelope in (
            ("altered data", altered_data),
            ("invalid digest", invalid_digest),
        ):
            with self.subTest(label=label):
                status, payload = self.request(
                    "POST",
                    "/api/messages/extract-raw",
                    body=json.dumps(envelope),
                    authenticated=True,
                )
                self.assertEqual(status, 400)
                self.assertIn("integrity", payload["error"].lower())
                self.assertEqual(self.storage.contents, existing_inbox)

    @unittest.skipUnless(
        shutil.which("node")
        and (
            shutil.which("chromium")
            or Path("/repl/tools/bin/chromium").is_file()
        ),
        "Node.js and Chromium are required for the admin browser test.",
    )
    def test_admin_dashboard_extracts_only_verified_damaged_backup_bytes(self) -> None:
        original_bytes = b"\x00damaged inbox bytes\xff{"
        existing_inbox = json.dumps([self.record(id="browser-baseline")], separators=(",", ":"))
        self.storage.contents = existing_inbox

        valid_envelope = json.loads(server.create_contact_raw_backup(original_bytes))
        altered_envelope = json.loads(json.dumps(valid_envelope))
        altered_envelope["integrity"]["value"] = "0" * 64
        restore_backup = json.loads(server.create_contact_backup([self.record(id="browser-restore")]))
        replacement_restore_backup = json.loads(
            server.create_contact_backup([
                self.record(id="browser-restore-replacement"),
                self.record(id="browser-restore-replacement-2"),
            ])
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            valid_path = temp_path / f"damaged-inbox-{('verified-' * 8)}selection.json"
            altered_path = temp_path / f"altered-damaged-inbox-{('replacement-' * 6)}selection.json"
            restore_path = temp_path / f"contact-inbox-{('restore-' * 8)}backup.json"
            replacement_restore_path = temp_path / f"contact-inbox-{('replacement-' * 6)}backup.json"
            download_path = temp_path / "downloads"
            download_path.mkdir()
            valid_path.write_text(json.dumps(valid_envelope), encoding="utf-8")
            altered_path.write_text(json.dumps(altered_envelope), encoding="utf-8")
            restore_path.write_text(json.dumps(restore_backup), encoding="utf-8")
            replacement_restore_path.write_text(json.dumps(replacement_restore_backup), encoding="utf-8")

            ready_path = temp_path / "session-expiration-ready"
            continue_path = temp_path / "session-expiration-continue"
            browser_script = Path(__file__).with_name("admin_backup_browser.js")
            chromium = shutil.which("chromium") or "/repl/tools/bin/chromium"
            process = subprocess.Popen(
                [
                    shutil.which("node") or "node",
                    str(browser_script),
                    f"http://127.0.0.1:{self.http_server.server_port}",
                    self.session_token,
                    str(valid_path),
                    str(altered_path),
                    str(restore_path),
                    str(replacement_restore_path),
                    str(download_path),
                    chromium,
                    str(ready_path),
                    str(continue_path),
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            deadline = server.time.monotonic() + 60
            try:
                while not ready_path.exists() and process.poll() is None:
                    if server.time.monotonic() >= deadline:
                        self.fail("Browser did not reach the active dashboard before session expiration.")
                    server.time.sleep(0.05)

                if process.poll() is not None:
                    stdout, stderr = process.communicate()
                    self.fail(
                        "Browser exited before the session-expiration check.\n"
                        f"stdout:\n{stdout}\nstderr:\n{stderr}"
                    )

                server.sessions[self.session_token] = server.time.time() - 1
                continue_path.write_text("expired", encoding="utf-8")
                stdout, stderr = process.communicate(timeout=60)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.communicate()

            self.assertEqual(
                process.returncode,
                0,
                msg=f"Browser extraction check failed.\nstdout:\n{stdout}\nstderr:\n{stderr}",
            )

            recovered_files = list(download_path.glob("contact-inbox-recovered*"))
            self.assertEqual([path.name for path in recovered_files], ["contact-inbox-recovered.bin"])
            self.assertEqual(recovered_files[0].read_bytes(), original_bytes)
            self.assertEqual(self.storage.contents, existing_inbox)

    def test_versioned_backup_download_passes_preview_and_restore(self) -> None:
        messages = [self.record(id="downloaded")]
        self.storage.contents = json.dumps(messages, separators=(",", ":"))
        status, _headers, body = self.request_raw(
            "GET",
            "/api/messages/backup",
            authenticated=True,
        )
        self.assertEqual(status, 200)

        backup_content = body.decode("utf-8")
        status, preview = self.request(
            "POST",
            "/api/messages/preview",
            body=backup_content,
            authenticated=True,
        )
        self.assertEqual(status, 200)
        self.assertEqual(preview["count"], 1)

        status, restored = self.request(
            "POST",
            "/api/messages/restore",
            body=backup_content,
            authenticated=True,
        )
        self.assertEqual(status, 200)
        self.assertEqual(restored, {"ok": True, "count": 1})
        self.assertEqual(json.loads(self.storage.contents or "null"), messages)

    def test_damaged_backup_download_is_verified_but_not_previewed_or_restored(self) -> None:
        self.storage.contents = "{"
        status, _headers, body = self.request_raw(
            "GET",
            "/api/messages/backup",
            authenticated=True,
        )
        self.assertEqual(status, 200)
        damaged_backup = json.loads(body.decode("utf-8"))
        exported_content = body.decode("utf-8")

        for action in ("/api/messages/preview", "/api/messages/restore"):
            with self.subTest(action=action):
                status, payload = self.request(
                    "POST",
                    action,
                    body=exported_content,
                    authenticated=True,
                )
                self.assertEqual(status, 400)
                self.assertIn("not a valid message list", payload["error"].lower())
                self.assertEqual(self.storage.contents, "{")

        damaged_backup["rawContent"]["data"] += "AA=="
        for action in ("/api/messages/preview", "/api/messages/restore"):
            with self.subTest(action=action, tampered=True):
                status, payload = self.request(
                    "POST",
                    action,
                    body=json.dumps(damaged_backup),
                    authenticated=True,
                )
                self.assertEqual(status, 400)
                self.assertIn("integrity", payload["error"].lower())
                self.assertEqual(self.storage.contents, "{")

    def test_backup_preview_requires_authentication_and_does_not_change_inbox(self) -> None:
        existing_inbox = json.dumps([self.record(id="existing")], separators=(",", ":"))
        self.storage.contents = existing_inbox
        backup = [
            self.record(id="older", name="Older Sender", submittedAt="2026-09-20T12:00:00+00:00"),
            self.record(id="newest", name="Newest Sender", submittedAt="2026-09-27T12:00:00+00:00"),
            self.record(id="middle", name="Middle Sender", submittedAt="2026-09-25T12:00:00+00:00"),
            self.record(id="second-newest", name="Second Sender", submittedAt="2026-09-26T12:00:00+00:00"),
        ]
        backup_content = json.dumps(backup)

        status, payload = self.request("POST", "/api/messages/preview", body=backup_content)
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"], "Authentication required.")
        self.assertEqual(self.storage.contents, existing_inbox)

        status, payload = self.request(
            "POST",
            "/api/messages/preview",
            body=backup_content,
            authenticated=True,
        )

        self.assertEqual(status, 200)
        self.assertEqual(
            payload,
            {
                "ok": True,
                "count": 4,
                "senders": ["Newest Sender", "Second Sender", "Middle Sender"],
            },
        )
        self.assertEqual(self.storage.contents, existing_inbox)

    def test_invalid_or_oversized_backup_preview_does_not_change_inbox(self) -> None:
        existing_inbox = json.dumps([self.record()], separators=(",", ":"))
        self.storage.contents = existing_inbox
        invalid_backups = (
            "{",
            json.dumps({"messages": [self.record()]}),
            json.dumps([self.record(id="valid-first"), {"id": "incomplete"}]),
        )

        for backup in invalid_backups:
            with self.subTest(backup=backup):
                status, payload = self.request(
                    "POST",
                    "/api/messages/preview",
                    body=backup,
                    authenticated=True,
                )
                self.assertEqual(status, 400)
                self.assertIn("backup", payload["error"].lower())
                self.assertEqual(self.storage.contents, existing_inbox)

        with patch.object(server, "MAX_CONTACT_BACKUP_BYTES", 5):
            status, payload = self.request(
                "POST",
                "/api/messages/preview",
                body='"12345"',
                authenticated=True,
            )
        self.assertEqual(status, 400)
        self.assertIn("25 MB", payload["error"])
        self.assertEqual(self.storage.contents, existing_inbox)

    def test_altered_and_truncated_versioned_backups_are_rejected(self) -> None:
        existing_inbox = json.dumps([self.record(id="existing")], separators=(",", ":"))
        messages = [
            self.record(id="older", name="Older Sender"),
            self.record(id="newer", name="Newer Sender"),
        ]
        self.storage.contents = existing_inbox
        backup = json.loads(server.create_contact_backup(messages))

        altered_backup = json.loads(json.dumps(backup))
        altered_backup["messages"][0]["message"] = "Edited after download"
        truncated_backup = json.loads(json.dumps(backup))
        truncated_backup["messages"].pop(0)
        invalid_integrity_backup = json.loads(json.dumps(backup))
        invalid_integrity_backup["integrity"]["value"] = "not-a-digest"

        for action in ("/api/messages/preview", "/api/messages/restore"):
            for label, damaged_backup in (
                ("altered", altered_backup),
                ("truncated", truncated_backup),
                ("invalid integrity value", invalid_integrity_backup),
            ):
                with self.subTest(action=action, damage=label):
                    status, payload = self.request(
                        "POST",
                        action,
                        body=json.dumps(damaged_backup),
                        authenticated=True,
                    )
                    self.assertEqual(status, 400)
                    self.assertIn("integrity", payload["error"].lower())
                    self.assertEqual(self.storage.contents, existing_inbox)

    def test_restore_requires_authentication(self) -> None:
        original_contents = json.dumps([self.record()])
        self.storage.contents = original_contents

        status, payload = self.request(
            "POST",
            "/api/messages/restore",
            body=json.dumps([self.record(id="replacement")]),
        )

        self.assertEqual(status, 401)
        self.assertEqual(payload["error"], "Authentication required.")
        self.assertEqual(self.storage.contents, original_contents)

    def test_invalid_restore_data_does_not_overwrite_existing_inbox(self) -> None:
        original_contents = json.dumps([self.record()], separators=(",", ":"))
        self.storage.contents = original_contents
        invalid_backups = (
            json.dumps([self.record(id="valid-first"), {"id": "incomplete"}]),
            json.dumps({"messages": [self.record()]}),
            "{",
            json.dumps([self.record(status=[])]),
        )

        for backup in invalid_backups:
            with self.subTest(backup=backup):
                status, payload = self.request(
                    "POST",
                    "/api/messages/restore",
                    body=backup,
                    authenticated=True,
                )
                self.assertEqual(status, 400)
                self.assertIn("backup", payload["error"].lower())
                self.assertEqual(self.storage.contents, original_contents)

    def test_restore_validates_and_normalizes_before_saving(self) -> None:
        self.storage.contents = "{"
        legacy_backup = [
            {
                "id": "legacy-restore",
                "name": "Avery",
                "email": "avery@example.com",
                "message": "Recovered note",
                "receivedAt": "2025-12-01T09:00:00+00:00",
                "reason": "Old topic",
                "replied": True,
            }
        ]

        status, payload = self.request(
            "POST",
            "/api/messages/restore",
            body=json.dumps(legacy_backup),
            authenticated=True,
        )

        self.assertEqual(status, 200)
        self.assertEqual(payload, {"ok": True, "count": 1})
        self.assertEqual(
            json.loads(self.storage.contents or "null"),
            [
                {
                    "id": "legacy-restore",
                    "name": "Avery",
                    "email": "avery@example.com",
                    "reason": "Other",
                    "message": "Recovered note",
                    "submittedAt": "2025-12-01T09:00:00+00:00",
                    "read": False,
                    "status": "replied",
                    "repliedAt": None,
                }
            ],
        )

    def test_restore_storage_failure_preserves_existing_inbox(self) -> None:
        original_contents = json.dumps([self.record()])
        self.storage.contents = original_contents
        self.storage.upload_error = RuntimeError("storage offline")

        status, payload = self.request(
            "POST",
            "/api/messages/restore",
            body=json.dumps([self.record(id="replacement")]),
            authenticated=True,
        )

        self.assertEqual(status, 503)
        self.assertIn("unavailable", payload["error"].lower())
        self.assertEqual(self.storage.contents, original_contents)

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