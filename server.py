#!/usr/bin/env python3
"""Small authenticated server for the static personal site."""

from __future__ import annotations

import hmac
import html
import os
import secrets
import time
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse


ROOT = Path(__file__).resolve().parent
HOST = "0.0.0.0"
PORT = 5000
SESSION_TTL = 60 * 60 * 8
LOGIN_WINDOW = 60 * 5
MAX_LOGIN_ATTEMPTS = 5
SESSION_COOKIE = "admin_session"

sessions: dict[str, float] = {}
login_attempts: dict[str, list[float]] = {}


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


class SiteHandler(SimpleHTTPRequestHandler):
    server_version = "PersonalSite/1.0"

    def end_headers(self) -> None:
        if getattr(self, "_current_path", "") == "/admin.html":
            self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        super().end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        self._current_path = path

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

        super().do_GET()

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/login":
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


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), lambda *args, **kwargs: SiteHandler(*args, directory=ROOT, **kwargs))
    print(f"Serving authenticated site on http://{HOST}:{PORT}/", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()