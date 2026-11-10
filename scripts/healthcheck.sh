#!/usr/bin/env bash
set -euo pipefail
curl -fsS http://127.0.0.1:8430/health; echo
curl -I -fsS http://127.0.0.1:4310 | head -1
curl -I -fsS http://127.0.0.1:4320 | head -1
