# Review profile

<!--
Read by the review-sweep and review-hotspots skills (plugin `review@carnufex`).
Keep it to facts about THIS repository; the skills hold the method. Delete a section you do not need:
a missing section means "use the skill's defaults".
-->

## Read first

<!-- Documents a reviewer reads before judging anything, beyond CLAUDE.md/AGENTS.md. -->
- `docs/security.md` — what is mitigated, and the accepted residual risks
- `docs/adr/index.md` — accepted decisions; read the ADRs of the area under review
- `docs/roadmap.md` — deferred work is not a finding

## Areas

<!-- review-sweep splits work by this table; one reviewer per row. -->
| Area | Where | Focus |
|---|---|---|
| `backend` | `src/` | endpoints, data, jobs |
| `web` | `web/src` | UX, accessibility, i18n, XSS |
| `deploy` | `charts/`, `Dockerfile`, `.github/` | containers, supply chain, CI |
| `quality` | `tests/`, `docs/` | test value, flakiness, doc drift |

## Project rules

<!-- Extra checks per dimension (architecture, security, usability, modernity, reliability, performance, tests, docs). -->
- architecture: <layering rule and the test that guards it>
- modernity: <runtime and framework versions the code should use>
- reliability: <where logs, metrics, traces and alerts live; what a good log line carries>

## Not a finding

- <things the project has decided not to care about, gates that already cover a class of problem>

## Tests policy

<!-- When a missing test is a finding. Default: authorisation, security and data boundaries, easy-to-get-wrong logic, regressions. -->

## Issues

- Labels: `type:<bug|chore|feature>`, `area:<...>`, `severity:<high|medium|low>`, `review-sweep`
- Areas for the `area:` label: <list>
- Language and style rules for issue text: <e.g. "no issue numbers in user-visible strings">

## Hotspots

<!--
review-hotspots ranks diff hunks by this table. Rows here replace the default ranks they name and are inserted above the
defaults otherwise. Rank 1 is the most dangerous.
-->
| Rank | Hotspot | What counts (paths, symbols) |
|---|---|---|
| 1 | <the code that must never be wrong> | `<paths>` |

## Person-reviewed paths

<!-- A PR touching these needs a person's approval; the hotspot map goes into the PR description. -->
- `<path glob>`

## Noise

<!-- Hunks review-hotspots drops before classifying: generated code, lock files, snapshots, migration designer files. -->
- `**/package-lock.json`
