#!/usr/bin/env bash
# Run the plugins' eval suites (claude plugin eval): does each skill still lead Claude to the right outcome, and how
# much better than without the plugin? Uses your Claude login, so it counts against your plan (or API bill in CI).
#
#   tools/eval.sh                 # every plugin with an evals/ directory, 3 runs per case, with the no-plugin baseline
#   tools/eval.sh delivery        # one plugin
#   QUICK=1 tools/eval.sh review  # one run per case, no baseline: for iterating on a skill or a grader
#
# A case passes at a with-plugin score of THRESHOLD (default 0.8). Reports land in plugins/<p>/evals/results/.
# The cases only grant read and write tools, so they also run on Windows, where shell-granting cases have no sandbox.
set -uo pipefail
cd "$(dirname "$0")/.."
threshold="${THRESHOLD:-0.8}"
judge="${JUDGE_MODEL:-sonnet}"
extra=()
[ -n "${QUICK:-}" ] && extra=(--runs 1 --ablation none)
[ -n "${MODEL:-}" ] && extra+=(--model "$MODEL")

plugins=("$@")
if [ ${#plugins[@]} -eq 0 ]; then
  for d in plugins/*/evals; do [ -d "$d" ] && plugins+=("$(basename "$(dirname "$d")")"); done
fi

status=0
for p in "${plugins[@]}"; do
  printf '\n== %s\n' "$p"
  claude plugin eval "plugins/$p" --trust-plugin --scaffold --allow-tools Write Edit --no-publish --threshold "$threshold" --judge-model "$judge" -j 2 "${extra[@]}" < /dev/null || status=1
done
printf '\n%s\n' "$([ $status -eq 0 ] && echo 'All eval suites passed.' || echo 'Some cases scored below the threshold; open the reports.')"
exit $status
