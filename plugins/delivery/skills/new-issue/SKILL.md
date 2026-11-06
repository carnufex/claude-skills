---
name: new-issue
description: Create a well-formed GitHub issue that someone (or another session) can start on without asking questions — de-duplicated, typed, labelled, in the right milestone, with testable acceptance criteria, and marked ready only when it truly is. Use when asked to create, file, write or log an issue, bug, task or idea, when work discovered outside the current scope needs a home, or when a note or transcript should become an issue. Also sets up the repository's delivery profile on first use.
---

# New issue

Repository facts — language of issue text, labels, milestones, the issue template, what "ready" means — are in
`.claude/profiles/delivery.md`.

## Profile missing?

Create it before anything else: copy `templates/profile.md` to `.claude/profiles/delivery.md` and fill it from what the
repository already says — `CLAUDE.md`/`AGENTS.md`, `CONTRIBUTING.md`, `.github/` (PR and issue templates, workflows),
`gh label list`, `gh api repos/{owner}/{repo}/milestones`, the deploy scripts and docs, `git log` (commit and PR title style).
Write only what you found; leave a section out rather than invent a rule. Tell the user in one line that you wrote it.

## Procedure

1. **Duplicates.** `gh issue list --state all --search "<two or three key words>"`, with a second wording. An open
   duplicate: comment on it instead. A closed one: link it ("Earlier: #<n>") and say why this one differs.
2. **Classify** with the profile's *Labels*: one type, one area, and the milestone or plan the profile's *Milestones*
   points at (ask `plan-milestone` if none fits and the work is larger than one issue). A bug gets steps to reproduce,
   expected and actual behaviour.
3. **Write** in the profile's language, with the profile's *Issue template* sections. Without one:
   - **Background** — why this matters, what exists today (with `path:line` or links).
   - **Goal** — the outcome, from the outside.
   - **Acceptance criteria** — checkboxes, each one observable or testable. "Works well" is not a criterion.
   - **Review key** — the one check, decided now, that says the work is done and that the implementer cannot move:
     parity with the legacy output, a shadow-traffic diff, bit-exact output, a spec or e2e check that measures the
     behaviour, or an eval threshold (`review-key` has the kinds and what makes one good). Name the corpus or the
     checks and the normalisation. It must fail today. Heading per the profile's *Review keys*.
   - **Out of scope** — what this issue deliberately does not do.
   - **How we'd notice it failing** — for behaviour that runs in production: the alert, log line or metric that
     would show it broken at 3 am, existing or to be added. Omit for docs and pure tooling.
   - **References** — ADRs, docs, related issues ("Found in #<n>" for discovered work).
4. **Ready or not.** Set the profile's ready status only if someone could start without a question **and the issue has a
   review key** (a `judgement` key says who judges and what they look at). If it needs a human
   decision first, follow `decision` instead (a `needs-human` section with the question, options and your recommendation).
   If you could find the answer yourself — in the repository, a related repository or the docs — find it.
5. **Create** with a body file (never inline long bodies in the shell):
   `gh issue create --title "<title>" --body-file <file> --label "<labels>" [--milestone "<milestone>"]`.
   Title: imperative or descriptive per the profile, specific, no issue numbers. If the profile uses a project board, put
   the issue in the right column.
6. **Report** the link, its labels and milestone, and whether it is ready.

## Many issues at once

From a plan, a review or a transcript: create them one by one with the procedure above, then link dependencies
("Blocked by #<n>") and report them as a list with their order. More than five belonging together is a milestone: use
`plan-milestone`.
