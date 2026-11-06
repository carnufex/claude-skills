# Delivery profile

<!--
Read by the delivery plugin's skills (new-issue, work-issue, plan-milestone, decision, ship).
Facts about THIS repository only; the skills hold the method. A missing section means "use the skill's default".
-->

## Language

- Issues, PR descriptions and issue comments: <English | Swedish>
- Code, commits and repository docs: <English>

## Labels

- Type: `type:<feature|bug|chore|task|spike|decision>`
- Area: `area:<...>`
- Status: `status:ready`, `status:in-progress`, `status:blocked` <or: a project board, see Status>
- Human: `needs-human` (with the section `## What is needed from you`), `decision` for architectural ones
- Priority: <`priority` label | `prio:P0` … | milestone order>

## Status and claims

- Ready: <label or board column>
- Claim: `node <work-issue skill>/scripts/claim.mjs claim <n> --label status:in-progress --as "Claude (<person>): <title>" --branch <n>-<slug>`
  <or the repository's own command>
- Blocked: <label or column>
- Board: <GitHub Projects board and its columns, if used>

## Milestones

- <GitHub milestones named "…" | a plans file `docs/plans.md` | none>
- Order of work: <e.g. the `priority` label first, then the current milestone>

## Issue template

<Section headings in the profile's language, if different from new-issue's default.>

## Branches and commits

- Default branch: `main`; may it be pushed to directly? <no: PRs only>
- Branch: `<n>-<slug>`; worktrees at `../<repo>-<n>` when the checkout is shared
- Commits: <`<type>(<scope>): <summary> (#<n>)` | `<Area>: <what> (#<n>)`>
- PR title: <format>; body: <`.github/pull_request_template.md` | what/Verified/3 am>

## Tests policy

<When tests are expected; default: authorisation and data boundaries, logic that is easy to get wrong, bug regressions.>

## Verify

| Change touches | Run |
|---|---|
| anything | `<command>` |
| web | `<command>` |

## Review keys

- Issue heading: `## Review key` <or the profile language's heading>
- Key files: `.review-keys/<n>.json`; key-owned corpora and check scripts under `<review-keys/<n>/ | e2e/review-keys/>`
- Evidence: `out/review-key/<n>/` (git-ignored)
- What the checks need running: <e.g. `docker compose up -d` (legacy on :8080), candidate `dotnet run` on :8081>
- Usual kinds here: <parity against the legacy API | e2e checks that measure the UI | eval sets>

## Demo

<!-- Read by the showcase plugin's pr-demo skill. Leave out to skip demos. -->
- When: <every PR | user-visible changes and ports>
- Language of the captions: <English | Swedish>
- Record the changed flow: <command that writes a .webm of the flow, e.g. `RECORD_VIDEO=out/demo/<n> node e2e/<check>.mjs`>
- App for screenshots: <URL of the local stack>

## Notify

- Slack: <channel id for PR demos, e.g. a `#pr-demos` channel the bot is in>; posted as the bot with the showcase plugin's
  `post-slack.mjs` (token from `SLACK_BOT_TOKEN` or the slack-channel plugin's `.env`)
- What: the PR link, three lines on what changed, the review key verdict, the demo video

## Merge

- Who decides it ships: <the person you work for | any green PR>
- Method: squash, delete branch
- Merging deploys: <yes | no>

## Deploy

- How: <automatic on merge via `<workflow>` | `<script> --deploy`>
- Never: <e.g. bump the GitOps pin by hand>
- Fallback when the pipeline is down: <doc or command>
- GitOps repository and path: `<repo>/<path>`

## Live

- URL: <https://…>; health: `<curl …>`
- Logs: `<kubectl -n <ns> logs deploy/<name>>`
- What to check besides health: <sign in as a demo user, …>

## Rollback

<revert the PR | revert the deploy commit in the GitOps repo>

## When it breaks

| Symptom | Usual cause |
|---|---|
| `ImagePullBackOff` | <…> |

## Decisions

- ADR folder and template: `docs/adr/NNNN-<slug>.md` (Status, Context, Decision, Consequences); index: `docs/adr/index.md`
- Needs-human section heading: `## What is needed from you`
- Session start: <check needs-human issues for answers: yes | no>
