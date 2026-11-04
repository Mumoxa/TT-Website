#!/usr/bin/env bash
# Post-deploy smoke check for the assessment API. Run after deploying to a Pages URL.
# Usage:  BASE_URL=https://<host> ASSESSMENT_ADMIN_KEY=<key> scripts/post-deploy-check.sh
# Prints HTTP status codes only. Never prints the admin key or the session cookie.
set -u
BASE_URL="${BASE_URL:-}"
if [ -z "$BASE_URL" ] || [ -z "${ASSESSMENT_ADMIN_KEY:-}" ]; then
  echo "Set BASE_URL and ASSESSMENT_ADMIN_KEY." >&2
  exit 2
fi
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT
fail=0
check() { # label expected actual
  if [ "$2" = "$3" ]; then echo "PASS  $1 ($3)"; else echo "FAIL  $1 (expected $2, got $3)"; fail=1; fi
}

# 1. Public invite route with an unknown token: reaches D1 and returns a JSON refusal (404), not 503.
code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/api/assessment/invite?token=$(printf '0%.0s' $(seq 64))")
check "invite route reaches D1 (unknown token refused)" 404 "$code"

# 2. Admin login with the configured key. Key is passed on stdin, not in argv.
code=$(printf '{"key":"%s"}' "$ASSESSMENT_ADMIN_KEY" | curl -sS -o /dev/null -w '%{http_code}' \
  -H "Origin: $BASE_URL" -H 'Content-Type: application/json' -c "$JAR" --data-binary @- "$BASE_URL/api/assessment/admin/login")
check "admin login accepts configured key" 200 "$code"

# 3. Admin session and list queries run against D1.
code=$(curl -sS -o /dev/null -w '%{http_code}' -b "$JAR" "$BASE_URL/api/assessment/admin/session")
check "admin session cookie valid" 200 "$code"
code=$(curl -sS -o /dev/null -w '%{http_code}' -b "$JAR" "$BASE_URL/api/assessment/admin/list")
check "admin list queries production D1" 200 "$code"

# 4. Wrong key is refused.
code=$(printf '{"key":"not-the-key"}' | curl -sS -o /dev/null -w '%{http_code}' \
  -H "Origin: $BASE_URL" -H 'Content-Type: application/json' --data-binary @- "$BASE_URL/api/assessment/admin/login")
check "admin login refuses wrong key" 401 "$code"

if [ "$fail" -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "SOME CHECKS FAILED"; fi
exit $fail
