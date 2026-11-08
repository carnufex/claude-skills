#!/usr/bin/env bash
# Copies this case's fixture into the empty run workspace.
set -euo pipefail
cp -R "$(dirname "$0")/fixture/." .
