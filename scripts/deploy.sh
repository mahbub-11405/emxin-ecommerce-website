#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only || true
docker compose build
docker compose up -d
docker compose ps
docker image prune -f
curl -fsS http://127.0.0.1:8430/health && echo
