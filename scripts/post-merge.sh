#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

PYTHON_BIN="$(command -v python3)"
SITE_PACKAGES="$("$PYTHON_BIN" -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')"
REQUIREMENTS_FILE="$(mktemp)"
trap 'rm -f "$REQUIREMENTS_FILE"' EXIT

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

"$PYTHON_BIN" -m unittest discover -s tests