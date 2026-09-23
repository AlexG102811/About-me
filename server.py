#!/usr/bin/env python3
"""Small authenticated server for the static personal site."""

from __future__ import annotations

import hmac
import html
import json
import os
import re
import secrets
import time
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse


ROOT = Path(__file__).resolve().parent
MESSAGES_PATH = ROOT / ".site-messages.json"
HOST = "0.0.0.0"
PORT = 5000
SESSION_TTL = 60 * 60 * 8
LOGIN_WINDOW = 60 * 5
MAX_LOGIN_ATTEMPTS = 5
MESSAGE_WINDOW = 60 * 15
MAX_MESSAGE_ATTEMPTS = 10
SESSION_COOKIE = "admin_session"

sessions: dict[str, float] = {}
login_attempts: dict[str, list[float]] = {}
message_attempts: dict[str, list[float]] = {}


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


def load_messages() -> list[dict]:
    if not MESSAGES_PATH.exists():
        return []
    try:
        messages = json.loads(MESSAGES_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise RuntimeError("The message store contains invalid JSON.") from error
    if not isinstance(messages, list):
        raise RuntimeError("The message store must contain a list.")
    return messages


def save_messages(messages: list[dict]) -> None:
    temporary_path = MESSAGES_PATH.with_suffix(".tmp")
    temporary_path.write_text(
        json.dumps(messages, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary_path.replace(MESSAGES_PATH)


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

        if path == "/api/messages":
            if not has_valid_session(self):
                message_response(self, {"error": "Authentication required."}, HTTPStatus.UNAUTHORIZED)
                return
            message_response(self, {"messages": load_messages()})
            return

        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        if path == "/messages":
            self.receive_message()
            return

        if path.startswith("/api/messages/") and path.endswith("/read"):
            self.mark_message_read(path)
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

        if not 1 <= len(name) <= 80:
            self.respond_to_message_submission({"error": "Please enter your name."}, HTTPStatus.BAD_REQUEST)
            return
        if not valid_email(email):
            self.respond_to_message_submission({"error": "Please enter a valid email address."}, HTTPStatus.BAD_REQUEST)
            return
        if not 1 <= len(message) <= 3000:
            self.respond_to_message_submission({"error": "Please write a message before sending."}, HTTPStatus.BAD_REQUEST)
            return

        messages = load_messages()
        messages.append(
            {
                "id": uuid.uuid4().hex,
                "name": name,
                "email": email,
                "message": message,
                "submittedAt": datetime.now(timezone.utc).isoformat(),
                "read": False,
            }
        )
        save_messages(messages)
        self.respond_to_message_submission({"ok": True, "message": "Thanks for reaching out."})

    def respond_to_message_submission(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        if "application/json" in self.headers.get("Accept", ""):
            message_response(self, payload, status)
            return
        if status == HTTPStatus.OK:
            self.redirect("/index.html?message=sent#contact")
            return
        self.redirect("/index.html?message=error#contact")

    def mark_message_read(self, path: str) -> None:
        if not has_valid_session(self):
            message_response(self, {"error": "Authentication required."}, HTTPStatus.UNAUTHORIZED)
            return

        parts = path.split("/")
        message_id = parts[3] if len(parts) == 5 else ""
        messages = load_messages()
        for message in messages:
            if message.get("id") == message_id:
                message["read"] = True
                save_messages(messages)
                message_response(self, {"ok": True, "message": message})
                return
        message_response(self, {"error": "Message not found."}, HTTPStatus.NOT_FOUND)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), lambda *args, **kwargs: SiteHandler(*args, directory=ROOT, **kwargs))
    print(f"Serving authenticated site on http://{HOST}:{PORT}/", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()