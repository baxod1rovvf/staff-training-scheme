#!/usr/bin/env bash
# Usage: scripts/check-test-cases.sh <task-number>
# Verifies docs/test-cases.md has a "## Task N" section whose table rows all end in PASS.
set -euo pipefail
n="$1"; f="$(dirname "$0")/../docs/test-cases.md"
section=$(awk -v n="$n" '$0 ~ "^## Task "n"( |:|$)"{on=1;next} /^## /{on=0} on' "$f")
rows=$(printf '%s\n' "$section" | grep -E '^\| *[0-9]+' || true)
total=$(printf '%s\n' "$rows" | grep -c . || true)
pass=$(printf '%s\n' "$rows" | grep -cE '\| *PASS *\|? *$' || true)
echo "Task $n: $pass/$total cases PASS"
[ "$total" -gt 0 ] && [ "$pass" -eq "$total" ]
