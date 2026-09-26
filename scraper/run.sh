#!/usr/bin/env bash
# Starts the self-hosted Meta Ad Library scraper on http://127.0.0.1:8787
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .venv ]; then python3 -m venv .venv; fi
. .venv/bin/activate
pip install -q -r requirements.txt
exec uvicorn app:app --host 127.0.0.1 --port "${PORT:-8787}"
