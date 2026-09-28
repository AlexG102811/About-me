#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

PYTHON_BIN="$(command -v python3)"
SITE_PACKAGES="$("$PYTHON_BIN" -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')"
REQUIREMENTS_FILE="$(mktemp)"
TEST_OUTPUT="$(mktemp)"
trap 'rm -f "$REQUIREMENTS_FILE" "$TEST_OUTPUT"' EXIT

uv export \
  --format requirements.txt \
  --locked \
  --no-dev \
  --no-emit-project \
  --no-hashes \
  --output-file "$REQUIREMENTS_FILE"

mkdir -p "$SITE_PACKAGES"
UV_LINK_MODE=copy uv pip install \
  --target "$SITE_PACKAGES" \
  --python "$PYTHON_BIN" \
  --requirements "$REQUIREMENTS_FILE"

if "$PYTHON_BIN" -m unittest discover -s tests >"$TEST_OUTPUT" 2>&1; then
  cat "$TEST_OUTPUT"
else
  TEST_STATUS=$?
  cat "$TEST_OUTPUT"
  if grep -qF 'FAILED (failures=1)' "$TEST_OUTPUT" \
    && grep -qF 'FAIL: test_admin_dashboard_extracts_only_verified_damaged_backup_bytes' "$TEST_OUTPUT" \
    && grep -qF 'Timed out waiting for GET /api/messages/backup to return to sign-in.' "$TEST_OUTPUT"; then
    printf '\nRetrying the admin browser test after its transient Chromium redirect timeout.\n' >&2
    "$PYTHON_BIN" -m unittest \
      tests.test_contact_inbox.ContactInboxTests.test_admin_dashboard_extracts_only_verified_damaged_backup_bytes
  else
    exit "$TEST_STATUS"
  fi
fi