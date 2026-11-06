---
name: work-issue
description: Take a GitHub issue from "ready" to a pull request — pick or read the issue, claim it so no other person or session works on it, comment a plan, branch (in a worktree when the checkout is shared), implement with the tests the project's policy asks for, record decisions and discovered work in the issue, and stop with needs-human when a human decision is required. Use when asked to work on, take, start or continue an issue (with or without a number), "pick the next issue", or to work through a milestone. Hands off to ship for PR, merge and deploy.
---

# Work an issue

Issues are the working memory: someone reading only the issue and its PR must understand what was done and why.
Repository facts (labels, how claims and status work, branch and commit format, test commands, language of issue text) are
in `.claude/profiles/delivery.md`. **Read it first.** If it is missing, create it as `new-issue` describes, then come back.

## 1. Pick

Given a number: use it. Otherwise pick the first issue that is free, in this order unless the profile says otherwise:

1. open issues the profile's *Priority* names (a `priority` label, a board column, the current milestone);
2. then by milestone order, then oldest first.

Skip issues that are claimed, labelled `needs-human` or blocked, or that lack acceptance criteria. If the user asked for a
whole milestone, work its issues in dependency order, one claim at a time unless told to claim them all.

## 2. Read

`gh issue view <n> --comments`, the issues it links, the ADRs and docs it names, and the code it lands in. If the issue is
`needs-human`, has no clear acceptance criteria, or contradicts an accepted ADR: comment what is missing and stop (see
`decision`). Do not guess the requirement.

## 3. Claim

Claim before writing code, the way the profile's *Claims* says. The default is the bundled `scripts/claim.mjs`, race-safe
for parallel sessions (the oldest claim comment wins, the loser backs out). Run it from inside the repository's checkout:

```bash
node <this skill's directory>/scripts/claim.mjs list [--milestone <m>] [--label <status label>]
node <this skill's directory>/scripts/claim.mjs claim <n> --as "Claude (<person>): <session title>" --branch <n>-<slug> [--label <status label>]
node <this skill's directory>/scripts/claim.mjs unclaim <n> [--label <status label>]
```

`--label` defaults to `status:in-progress`. A repository with its own claim command (the profile names it) uses that. If
the issue is already claimed, do not work on it: pick another or tell the user. Also apply the profile's other status
changes (remove `status:ready`, move the board card to *In progress*).

## 4. Plan in the issue

Anything larger than a small fix gets a plan comment before code: approach, the files or slices it touches, the test plan
(which tests prove the acceptance criteria), **the 3 am signal** (if this broke in production, which alert, log line with ids
or trace would show it — existing or to be added), and open questions. A question you can answer yourself from the repo,
the docs or a related repository is answered, not asked.

## 5. Branch and build

- Branch `<n>-<slug>` from the latest default branch (profile: *Branches*). If the main checkout has changes you did not
  make, work in a worktree (`git worktree add <profile's worktree location> -b <n>-<slug> origin/<default>`). Never commit,
  stash or reset someone else's changes.
- Implement. Tests follow the profile's *Tests policy*; a bug fix gets the regression test that fails before the fix.
- Commits per the profile's *Commits* format, each referencing `#<n>`. Stage explicit paths, never `git add -A`.
- **Record as you go** in the issue: decisions and why, surprises, measurements. Not every keystroke — the things a
  reviewer would otherwise ask.
- **Discovered work** outside the scope becomes a new issue (`new-issue`), linked with "Found in #<n>". Do not widen
  the scope silently.

## 6. Blocked

- Blocked by another issue or an outside fact: the profile's blocked status, plus a comment with what unblocks it.
- Needs a human decision: follow `decision` (a `needs-human` section with the concrete question, options and your
  recommendation). Then continue with work that is not blocked.

## 7. Done or stopped

- Done: hand off to `ship` (verify, PR with `Closes #<n>`, merge, deploy, verify live, close the loop).
- Stopping before done: unclaim, and comment what is done, what is left and where the branch is. A claim nobody works on
  blocks everyone else.
