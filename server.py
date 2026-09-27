#!/usr/bin/env python3
"""Small authenticated server for the static personal site."""

from __future__ import annotations

import base64
import hashlib
import hmac
import html
import json
import os
import re
import secrets
import threading
import time
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

from replit.object_storage import Client
from replit.object_storage.errors import ObjectNotFoundError


ROOT = Path(__file__).resolve().parent
MESSAGES_PATH = ROOT / ".site-messages.json"
MESSAGES_OBJECT_NAME = "data/contactReceived.json"
HOST = "0.0.0.0"
PORT = 5000
SESSION_TTL = 60 * 60 * 8
LOGIN_WINDOW = 60 * 5
MAX_LOGIN_ATTEMPTS = 5
MESSAGE_WINDOW = 60 * 15
MAX_MESSAGE_ATTEMPTS = 10
MAX_CONTACT_BACKUP_BYTES = 25 * 1024 * 1024
CONTACT_BACKUP_FORMAT_VERSION = 1
CONTACT_RAW_BACKUP_FORMAT = "contact-inbox-raw"
CONTACT_RAW_BACKUP_FORMAT_VERSION = 1
CONTACT_RAW_BACKUP_INTEGRITY_VERSION = 1
SESSION_COOKIE = "admin_session"

sessions: dict[str, float] = {}
login_attempts: dict[str, list[float]] = {}
message_attempts: dict[str, list[float]] = {}
contact_storage_lock = threading.RLock()


class ContactStorageUnavailable(Exception):
    """Raised when Replit App Storage cannot serve the contact inbox."""


def configured_secret() -> str:
    secret = os.environ.get("SESSION_SECRET")
    if not secret:
        raise RuntimeError("SESSION_SECRET must be configured before starting the server.")
    return secret


SESSION_SECRET = configured_secret().encode("utf-8")


def safe_next_path(value: str | None) -> str:
    if value == "/admin.html":
        return value
    return "/admin.html"


def client_address(handler: SimpleHTTPRequestHandler) -> str:
    forwarded_for = handler.headers.get("X-Forwarded-For", "")
    return forwarded_for.split(",", 1)[0].strip() or handler.client_address[0]


def purge_expired_sessions(now: float) -> None:
    for token, expires_at in list(sessions.items()):
        if expires_at <= now:
            sessions.pop(token, None)


def has_valid_session(handler: SimpleHTTPRequestHandler) -> bool:
    cookie = SimpleCookie()
    cookie.load(handler.headers.get("Cookie", ""))
    morsel = cookie.get(SESSION_COOKIE)
    if morsel is None:
        return False

    now = time.time()
    purge_expired_sessions(now)
    expires_at = sessions.get(morsel.value)
    return expires_at is not None and expires_at > now


def clean_login_attempts(now: float) -> None:
    for address, attempts in list(login_attempts.items()):
        recent = [attempt for attempt in attempts if now - attempt < LOGIN_WINDOW]
        if recent:
            login_attempts[address] = recent
        else:
            login_attempts.pop(address, None)


def login_is_limited(address: str, now: float) -> bool:
    clean_login_attempts(now)
    return len(login_attempts.get(address, [])) >= MAX_LOGIN_ATTEMPTS


def record_login_attempt(address: str, now: float) -> None:
    login_attempts.setdefault(address, []).append(now)


def clean_message_attempts(now: float) -> None:
    for address, attempts in list(message_attempts.items()):
        recent = [attempt for attempt in attempts if now - attempt < MESSAGE_WINDOW]
        if recent:
            message_attempts[address] = recent
        else:
            message_attempts.pop(address, None)


def message_is_limited(address: str, now: float) -> bool:
    clean_message_attempts(now)
    return len(message_attempts.get(address, [])) >= MAX_MESSAGE_ATTEMPTS


def record_message_attempt(address: str, now: float) -> None:
    message_attempts.setdefault(address, []).append(now)


def normalize_message(message: dict) -> dict:
    if not isinstance(message, dict):
        raise RuntimeError("The contact store contains an invalid record.")

    submitted_at = message.get("submittedAt") or message.get("receivedAt")
    if not all(
        isinstance(message.get(field), str) and message[field].strip()
        for field in ("id", "name", "email", "message")
    ):
        raise RuntimeError("The contact store contains an incomplete record.")
    if not isinstance(submitted_at, str) or not submitted_at.strip():
        raise RuntimeError("The contact store contains a record without a submission date.")

    status = message.get("status", "new")
    if message.get("replied") is True:
        status = "replied"
    if not isinstance(status, str) or status not in {"new", "replied"}:
        raise RuntimeError("The contact store contains an invalid reply status.")

    reason = message.get("reason") or "General"
    if not isinstance(reason, str) or reason not in {"General", "Baseball", "Gaming", "School", "Other"}:
        reason = "Other"

    return {
        "id": message["id"],
        "name": message["name"],
        "email": message["email"],
        "reason": reason,
        "message": message["message"],
        "submittedAt": submitted_at,
        "read": bool(message.get("read", False)),
        "status": status,
        "repliedAt": message.get("repliedAt") if status == "replied" else None,
    }


def load_legacy_messages() -> list[dict]:
    if not MESSAGES_PATH.exists():
        return []
    try:
        messages = json.loads(MESSAGES_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise RuntimeError("The message store contains invalid JSON.") from error
    if not isinstance(messages, list):
        raise RuntimeError("The message store must contain a list.")
    return [normalize_message(message) for message in messages]


def load_messages() -> list[dict]:
    with contact_storage_lock:
        try:
            serialized_messages = Client().download_as_text(MESSAGES_OBJECT_NAME)
        except ObjectNotFoundError:
            # Keep the original file intact so migration is reversible.
            messages = load_legacy_messages()
            save_messages(messages)
            return messages
        except Exception as error:
            raise ContactStorageUnavailable("Contact storage is unavailable.") from error

        try:
            stored_messages = json.loads(serialized_messages)
        except json.JSONDecodeError as error:
            raise RuntimeError("The App Storage contact file contains invalid JSON.") from error
        if not isinstance(stored_messages, list):
            raise RuntimeError("The App Storage contact file must contain a list.")

        messages = [normalize_message(message) for message in stored_messages]
        if messages != stored_messages:
            save_messages(messages)
        return messages


def save_messages(messages: list[dict]) -> None:
    try:
        Client().upload_from_text(
            MESSAGES_OBJECT_NAME,
            json.dumps([normalize_message(message) for message in messages], ensure_ascii=False, indent=2),
        )
    except Exception as error:
        raise ContactStorageUnavailable("Contact storage is unavailable.") from error


def read_contact_backup() -> bytes:
    """Read the inbox as-is so even malformed stored content can be preserved."""
    with contact_storage_lock:
        try:
            serialized_messages = Client().download_as_text(MESSAGES_OBJECT_NAME)
        except ObjectNotFoundError:
            if MESSAGES_PATH.exists():
                try:
                    return MESSAGES_PATH.read_bytes()
                except OSError as error:
                    raise ContactStorageUnavailable("Contact storage is unavailable.") from error
            return b"[]"
        except Exception as error:
            raise ContactStorageUnavailable("Contact storage is unavailable.") from error
        return serialized_messages.encode("utf-8")


def contact_backup_integrity(messages: list) -> str:
    canonical_messages = json.dumps(
        messages,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(canonical_messages).hexdigest()


def create_contact_backup(messages: list) -> bytes:
    backup = {
        "formatVersion": CONTACT_BACKUP_FORMAT_VERSION,
        "messageCount": len(messages),
        "integrity": {
            "algorithm": "sha256",
            "value": contact_backup_integrity(messages),
        },
        "messages": messages,
    }
    return json.dumps(backup, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")


def contact_raw_backup_integrity(raw_content: bytes) -> str:
    return hashlib.sha256(raw_content).hexdigest()


def create_contact_raw_backup(raw_content: bytes) -> bytes:
    backup = {
        "format": CONTACT_RAW_BACKUP_FORMAT,
        "formatVersion": CONTACT_RAW_BACKUP_FORMAT_VERSION,
        "integrity": {
            "version": CONTACT_RAW_BACKUP_INTEGRITY_VERSION,
            "algorithm": "sha256",
            "value": contact_raw_backup_integrity(raw_content),
        },
        "rawContent": {
            "encoding": "base64",
            "data": base64.b64encode(raw_content).decode("ascii"),
        },
    }
    return json.dumps(backup, ensure_ascii=False, indent=2).encode("utf-8")


def decode_contact_raw_backup(backup: dict) -> bytes:
    if type(backup.get("formatVersion")) is not int or backup["formatVersion"] != CONTACT_RAW_BACKUP_FORMAT_VERSION:
        raise ValueError("The damaged-inbox export uses an unsupported format version.")

    integrity = backup.get("integrity")
    raw_content = backup.get("rawContent")
    if (
        not isinstance(integrity, dict)
        or type(integrity.get("version")) is not int
        or integrity["version"] != CONTACT_RAW_BACKUP_INTEGRITY_VERSION
        or integrity.get("algorithm") != "sha256"
        or not isinstance(integrity.get("value"), str)
        or not re.fullmatch(r"[0-9a-f]{64}", integrity["value"])
        or not isinstance(raw_content, dict)
        or raw_content.get("encoding") != "base64"
        or not isinstance(raw_content.get("data"), str)
        or not raw_content["data"].isascii()
    ):
        raise ValueError("The damaged-inbox export has missing or unsupported integrity information.")

    try:
        decoded_content = base64.b64decode(raw_content["data"], validate=True)
    except (TypeError, ValueError) as error:
        raise ValueError("The damaged-inbox export integrity information could not be checked.") from error

    expected_integrity = contact_raw_backup_integrity(decoded_content)
    if not hmac.compare_digest(integrity["value"], expected_integrity):
        raise ValueError("The damaged-inbox export integrity check failed. The file may have been changed or truncated.")
    return decoded_content


def request_contact_raw_backup(handler: SimpleHTTPRequestHandler) -> bytes:
    try:
        length = int(handler.headers.get("Content-Length", "0"))
    except ValueError as error:
        raise ValueError("The damaged-inbox export size is invalid.") from error
    if length <= 0 or length > MAX_CONTACT_BACKUP_BYTES:
        raise ValueError("Choose a non-empty damaged-inbox export no larger than 25 MB.")

    try:
        backup = json.loads(handler.rfile.read(length).decode("utf-8"))
    except (ValueError, RecursionError) as error:
        raise ValueError("The damaged-inbox export must contain valid JSON.") from error

    if not isinstance(backup, dict) or backup.get("format") != CONTACT_RAW_BACKUP_FORMAT:
        raise ValueError("Choose a damaged-inbox export, not a regular message backup.")
    return decode_contact_raw_backup(backup)


def request_contact_backup(handler: SimpleHTTPRequestHandler) -> list[dict]:
    try:
        length = int(handler.headers.get("Content-Length", "0"))
    except ValueError as error:
        raise ValueError("The backup file size is invalid.") from error
    if length <= 0 or length > MAX_CONTACT_BACKUP_BYTES:
        raise ValueError("Choose a non-empty backup file no larger than 25 MB.")

    try:
        backup = json.loads(handler.rfile.read(length).decode("utf-8"))
    except (ValueError, RecursionError) as error:
        raise ValueError("The backup file must contain valid JSON.") from error

    if isinstance(backup, dict) and backup.get("format") == CONTACT_RAW_BACKUP_FORMAT:
        decode_contact_raw_backup(backup)
        raise ValueError(
            "The damaged-inbox export passed its integrity check, but its preserved content is not a valid message list."
        )
    if isinstance(backup, dict):
        if type(backup.get("formatVersion")) is not int or backup["formatVersion"] != CONTACT_BACKUP_FORMAT_VERSION:
            raise ValueError("The backup file uses an unsupported format version.")
        messages = backup.get("messages")
        message_count = backup.get("messageCount")
        integrity = backup.get("integrity")
        if not isinstance(messages, list):
            raise ValueError("The backup file must contain a list of messages.")
        if type(message_count) is not int or message_count != len(messages):
            raise ValueError("The backup integrity check failed: message count does not match.")
        if (
            not isinstance(integrity, dict)
            or integrity.get("algorithm") != "sha256"
            or not isinstance(integrity.get("value"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", integrity["value"])
        ):
            raise ValueError("The backup integrity information is missing or unsupported.")
        try:
            expected_integrity = contact_backup_integrity(messages)
        except (TypeError, ValueError, RecursionError) as error:
            raise ValueError("The backup integrity information could not be checked.") from error
        if not hmac.compare_digest(integrity["value"], expected_integrity):
            raise ValueError("The backup integrity check failed. The file may have been changed or truncated.")
    elif isinstance(backup, list):
        # Backups created before versioned integrity metadata were introduced.
        messages = backup
    else:
        raise ValueError("The backup file must contain a list of messages.")

    try:
        return [normalize_message(message) for message in messages]
    except RuntimeError as error:
        raise ValueError(f"The backup contains invalid messages: {error}") from error


def contact_backup_preview(messages: list[dict]) -> dict:
    def recent_key(item: tuple[int, dict]) -> tuple[datetime, int]:
        index, message = item
        try:
            submitted_at = datetime.fromisoformat(message["submittedAt"].replace("Z", "+00:00"))
        except (ValueError, OverflowError):
            submitted_at = datetime.min.replace(tzinfo=timezone.utc)
        if submitted_at.tzinfo is None:
            submitted_at = submitted_at.replace(tzinfo=timezone.utc)
        return submitted_at, index

    recent_messages = sorted(enumerate(messages), key=recent_key, reverse=True)[:3]
    return {
        "count": len(messages),
        "senders": [message["name"].strip() for _, message in recent_messages],
    }


def message_response(handler: SimpleHTTPRequestHandler, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
    response = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(response)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(response)


def valid_email(value: str) -> bool:
    return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value)) and len(value) <= 254


def request_json(handler: SimpleHTTPRequestHandler, maximum_length: int = 4096) -> dict:
    try:
        length = int(handler.headers.get("Content-Length", "0"))
    except ValueError as error:
        raise ValueError("The request body length is invalid.") from error
    if length < 0 or length > maximum_length:
        raise ValueError("The request body is too large.")
    try:
        payload = json.loads(handler.rfile.read(length).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("The request body must be valid JSON.") from error
    if not isinstance(payload, dict):
        raise ValueError("The request body must be a JSON object.")
    return payload


class SiteHandler(SimpleHTTPRequestHandler):
    server_version = "PersonalSite/1.0"

    def end_headers(self) -> None:
        if getattr(self, "_current_path", "") in {"/admin.html", "/future.html"}:
            self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        super().end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        self._current_path = path

        if path in {"/.site-messages.json", "/.site-messages.tmp"}:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        if path == "/admin.html" and not has_valid_session(self):
            query = urlencode({"next": "/admin.html"})
            self.redirect(f"/login.html?{query}")
            return

        if path == "/login.html" and has_valid_session(self):
            self.redirect("/admin.html")
            return

        if path == "/logout":
            self.logout()
            return

        if path == "/api/messages/backup":
            if not has_valid_session(self):
                message_response(self, {"error": "Authentication required."}, HTTPStatus.UNAUTHORIZED)
                return
            try:
                backup = read_contact_backup()
            except ContactStorageUnavailable:
                message_response(
                    self,
                    {"error": "The contact inbox is unavailable. Configure Replit App Storage and try again."},
                    HTTPStatus.SERVICE_UNAVAILABLE,
                )
                return

            try:
                stored_messages = json.loads(backup.decode("utf-8"))
                if isinstance(stored_messages, list):
                    backup = create_contact_backup(stored_messages)
                else:
                    backup = create_contact_raw_backup(backup)
            except (UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError, RecursionError):
                # Preserve malformed content byte-for-byte inside an integrity-checked envelope.
                backup = create_contact_raw_backup(backup)

            filename = f"contact-inbox-backup-{datetime.now(timezone.utc):%Y%m%d-%H%M%SZ}.json"
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Content-Length", str(len(backup)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(backup)
            return

        if path == "/api/messages":
            if not has_valid_session(self):
                message_response(self, {"error": "Authentication required."}, HTTPStatus.UNAUTHORIZED)
                return
            try:
                message_response(self, {"messages": load_messages()})
            except ContactStorageUnavailable:
                message_response(
                    self,
                    {"error": "The contact inbox is unavailable. Configure Replit App Storage and try again."},
                    HTTPStatus.SERVICE_UNAVAILABLE,
                )
            except RuntimeError:
                message_response(
                    self,
                    {"error": "The contact inbox contains invalid data. Contact the site owner for help."},
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                )
            return

        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        if path == "/messages":
            self.receive_message()
            return

        if path == "/api/messages/extract-raw":
            if not has_valid_session(self):
                message_response(self, {"error": "Authentication required."}, HTTPStatus.UNAUTHORIZED)
                return
            try:
                raw_content = request_contact_raw_backup(self)
            except ValueError as error:
                message_response(self, {"error": str(error)}, HTTPStatus.BAD_REQUEST)
                return
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header(
                "Content-Disposition",
                'attachment; filename="contact-inbox-recovered.bin"',
            )
            self.send_header("Content-Length", str(len(raw_content)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw_content)
            return

        if path == "/api/messages/preview":
            if not has_valid_session(self):
                message_response(self, {"error": "Authentication required."}, HTTPStatus.UNAUTHORIZED)
                return
            try:
                messages = request_contact_backup(self)
            except ValueError as error:
                message_response(self, {"error": str(error)}, HTTPStatus.BAD_REQUEST)
                return
            message_response(self, {"ok": True, **contact_backup_preview(messages)})
            return

        if path == "/api/messages/restore":
            if not has_valid_session(self):
                message_response(self, {"error": "Authentication required."}, HTTPStatus.UNAUTHORIZED)
                return
            try:
                replacement = request_contact_backup(self)
            except ValueError as error:
                message_response(self, {"error": str(error)}, HTTPStatus.BAD_REQUEST)
                return
            try:
                with contact_storage_lock:
                    save_messages(replacement)
            except ContactStorageUnavailable:
                message_response(
                    self,
                    {"error": "The contact inbox is unavailable. Configure Replit App Storage and try again."},
                    HTTPStatus.SERVICE_UNAVAILABLE,
                )
                return
            message_response(self, {"ok": True, "count": len(replacement)})
            return

        if path.startswith("/api/messages/") and path.endswith(("/read", "/reply")):
            self.update_message(path)
            return

        if path != "/login":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8", errors="replace")
        form = parse_qs(body)
        password = form.get("password", [""])[0]
        next_path = safe_next_path(form.get("next", [None])[0])
        address = client_address(self)
        now = time.time()

        if login_is_limited(address, now):
            self.render_login_error("Too many attempts. Try again in a few minutes.", next_path, HTTPStatus.TOO_MANY_REQUESTS)
            return

        expected_password = os.environ.get("ADMIN_PASSWORD")
        if not expected_password:
            self.send_error(HTTPStatus.SERVICE_UNAVAILABLE, "ADMIN_PASSWORD is not configured.")
            return

        if not hmac.compare_digest(password, expected_password):
            record_login_attempt(address, now)
            self.render_login_error("That password did not match.", next_path, HTTPStatus.UNAUTHORIZED)
            return

        token = secrets.token_urlsafe(32)
        sessions[token] = now + SESSION_TTL
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", next_path)
        secure = " Secure;" if self.headers.get("X-Forwarded-Proto", "").lower() == "https" else ""
        self.send_header(
            "Set-Cookie",
            f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_TTL};{secure}",
        )
        self.end_headers()

    def redirect(self, location: str) -> None:
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def logout(self) -> None:
        cookie = SimpleCookie()
        cookie.load(self.headers.get("Cookie", ""))
        morsel = cookie.get(SESSION_COOKIE)
        if morsel is not None:
            sessions.pop(morsel.value, None)

        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", "/login.html")
        self.send_header(
            "Set-Cookie",
            f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
        )
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def render_login_error(self, message: str, next_path: str, status: HTTPStatus) -> None:
        login_path = ROOT / "login.html"
        document = login_path.read_text(encoding="utf-8")
        safe_message = html.escape(message)
        marker = '<p class="auth-error" role="alert" data-auth-error></p>'
        replacement = f'<p class="auth-error" role="alert" data-auth-error>{safe_message}</p>'
        document = document.replace(marker, replacement)
        document = document.replace(
            '<input type="hidden" name="next" value="/admin.html" />',
            f'<input type="hidden" name="next" value="{html.escape(next_path, quote=True)}" />',
        )
        payload = document.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def receive_message(self) -> None:
        address = client_address(self)
        now = time.time()
        if message_is_limited(address, now):
            self.respond_to_message_submission(
                {"error": "Too many messages from this address. Try again later."},
                HTTPStatus.TOO_MANY_REQUESTS,
            )
            return

        record_message_attempt(address, now)
        length = int(self.headers.get("Content-Length", "0"))
        if length > 12000:
            self.respond_to_message_submission({"error": "Message is too large."}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            return

        body = self.rfile.read(length).decode("utf-8", errors="replace")
        form = parse_qs(body, keep_blank_values=True)
        name = form.get("name", [""])[0].strip()
        email = form.get("email", [""])[0].strip()
        message = form.get("message", [""])[0].strip()
        honeypot = form.get("website", [""])[0].strip()

        if honeypot:
            self.respond_to_message_submission({"ok": True, "message": "Thanks for reaching out."})
            return

        reason = form.get("reason", [""])[0].strip()
        if not 1 <= len(name) <= 80:
            self.respond_to_message_submission({"error": "Please enter your name."}, HTTPStatus.BAD_REQUEST)
            return
        if not valid_email(email):
            self.respond_to_message_submission({"error": "Please enter a valid email address."}, HTTPStatus.BAD_REQUEST)
            return
        if reason not in {"General", "Baseball", "Gaming", "School", "Other"}:
            self.respond_to_message_submission({"error": "Please choose a message topic."}, HTTPStatus.BAD_REQUEST)
            return
        if not 1 <= len(message) <= 3000:
            self.respond_to_message_submission({"error": "Please write a message before sending."}, HTTPStatus.BAD_REQUEST)
            return

        new_message = {
            "id": uuid.uuid4().hex,
            "name": name,
            "email": email,
            "reason": reason,
            "message": message,
            "submittedAt": datetime.now(timezone.utc).isoformat(),
            "read": False,
            "status": "new",
            "repliedAt": None,
        }
        try:
            with contact_storage_lock:
                messages = load_messages()
                messages.append(new_message)
                save_messages(messages)
        except ContactStorageUnavailable:
            self.respond_to_message_submission(
                {"error": "The message could not be saved. Please try again later."},
                HTTPStatus.SERVICE_UNAVAILABLE,
            )
            return
        except RuntimeError:
            self.respond_to_message_submission(
                {"error": "The message could not be saved because the contact inbox contains invalid data."},
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )
            return
        self.respond_to_message_submission({"ok": True, "message": "Thanks for reaching out."})

    def respond_to_message_submission(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        if "application/json" in self.headers.get("Accept", ""):
            message_response(self, payload, status)
            return
        if status == HTTPStatus.OK:
            self.redirect("/index.html?message=sent#contact")
            return
        self.redirect("/index.html?message=error#contact")

    def update_message(self, path: str) -> None:
        if not has_valid_session(self):
            message_response(self, {"error": "Authentication required."}, HTTPStatus.UNAUTHORIZED)
            return

        parts = path.split("/")
        message_id = parts[3] if len(parts) == 5 else ""
        action = parts[4] if len(parts) == 5 else ""
        try:
            payload = request_json(self)
        except ValueError as error:
            message_response(self, {"error": str(error)}, HTTPStatus.BAD_REQUEST)
            return

        if action == "read":
            if not isinstance(payload.get("read"), bool):
                message_response(self, {"error": "Choose whether the message is read."}, HTTPStatus.BAD_REQUEST)
                return
        elif action == "reply":
            if payload.get("status") not in {"new", "replied"}:
                message_response(self, {"error": "Choose a valid reply status."}, HTTPStatus.BAD_REQUEST)
                return
        else:
            message_response(self, {"error": "Unknown message action."}, HTTPStatus.NOT_FOUND)
            return

        try:
            with contact_storage_lock:
                messages = load_messages()
                for message in messages:
                    if message.get("id") != message_id:
                        continue
                    if action == "read":
                        message["read"] = payload["read"]
                    else:
                        message["status"] = payload["status"]
                        message["repliedAt"] = (
                            datetime.now(timezone.utc).isoformat()
                            if payload["status"] == "replied"
                            else None
                        )
                    save_messages(messages)
                    message_response(self, {"ok": True, "message": message})
                    return
        except ContactStorageUnavailable:
            message_response(
                self,
                {"error": "The contact inbox is unavailable. Configure Replit App Storage and try again."},
                HTTPStatus.SERVICE_UNAVAILABLE,
            )
            return
        except RuntimeError:
            message_response(
                self,
                {"error": "The contact inbox contains invalid data. Contact the site owner for help."},
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )
            return
        message_response(self, {"error": "Message not found."}, HTTPStatus.NOT_FOUND)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), lambda *args, **kwargs: SiteHandler(*args, directory=ROOT, **kwargs))
    print(f"Serving authenticated site on http://{HOST}:{PORT}/", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()