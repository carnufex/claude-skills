# guardrails

The delivery rules that must hold, as hooks instead of instructions. A rule in `CLAUDE.md` is a request the model may
forget under pressure; a hook is checked on every command.

**PreToolUse** (Bash and PowerShell), `scripts/guard.mjs`, refuses with the reason and the way to do it right:

| Rule | Refused | Passes |
|---|---|---|
| Stage explicit paths | `git add -A`, `--all`, `.`; `git commit -a` | `git add src/x.ts docs/y.md` |
| Fetch before you push | `git push` when the repository was not fetched in the last 15 minutes (`GUARDRAILS_FETCH_MINUTES`); force push to `main`/`master` | `git fetch && git push`; `--force-with-lease` on a branch |
| A committed review key is frozen | a commit changing `.review-keys/<n>.json` or one of its `oracle` paths once the key is in HEAD | the key commit itself; a human-approved change with `REVIEW_KEY_CHANGE=<n>` in front of the command |
| A `3 am:` line in every PR | `gh pr create` without one, in a repository with `.claude/profiles/delivery.md` | `3 am: <signal>` or `3 am: n/a (<why>)` |

Heredoc bodies and PowerShell here-strings (commit messages, PR bodies) are data, not commands. Any error in the guard
lets the command through: a broken guard never blocks work.

**SessionStart**, `scripts/session-start.mjs`: in a repository with a delivery profile, the session starts knowing the
open `needs-human` issues (marked when a newer comment may be the answer) and the claims untouched for 7 days
(`GUARDRAILS_STALE_DAYS`). Silent without `gh`, offline, or outside such a repository.

## Install

```text
/plugin marketplace add carnufex/claude-skills
/plugin install guardrails@carnufex
```

Install it at user scope to guard every repository, or enable it per repository in `.claude/settings.json`.

## Test

`node --test tests/guard.test.mjs` runs the guard as the hook runs (JSON in, decision out) against throwaway git
repositories.
