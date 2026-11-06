#!/usr/bin/env bash
# Run the checks CI runs (.github/workflows/validate.yml), locally, before you push.
#
#   tools/validate.sh              # compares plugin versions with origin/main
#   BASE=<ref> tools/validate.sh   # compare with another ref
set -uo pipefail
cd "$(dirname "$0")/.."
status=0
py="$(command -v python3 2>/dev/null || true)"
# On Windows python3 is the Store stub; prefer python there.
if [ -z "$py" ] || ! "$py" -c 'import sys' >/dev/null 2>&1; then py=python; fi

printf '\n== Skills, references, manifests, READMEs\n'
"$py" tools/validate_skills.py --base "${BASE:-origin/main}" || status=1

printf '\n== claude plugin validate --strict\n'
if command -v claude >/dev/null; then
  for target in . plugins/*/; do
    out="$(claude plugin validate "$target" --strict 2>&1)" || { echo "$out"; status=1; continue; }
    echo "ok: $target"
  done
else
  echo "skipped: the claude CLI is not on PATH"
fi

printf '\n%s\n' "$([ $status -eq 0 ] && echo 'All checks passed.' || echo 'Some checks failed; see above.')"
exit $status
