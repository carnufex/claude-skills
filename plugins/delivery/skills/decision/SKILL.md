---
name: decision
description: Handle work that needs a human decision without stalling — ask it as a needs-human issue with context, two or three options with trade-offs, a recommendation and what is blocked; carry on with unblocked work; at the start of a session, find decisions the human has answered and act on them; and record each decision as an ADR. Use when blocked on a choice that is not yours to make (architecture, cost, irreversible, product direction), when a change would deviate from an accepted ADR, when asked to "record a decision" or write an ADR, and at session start in repositories whose profile asks for the needs-human check.
---

# Decisions

Repository facts — label names, ADR folder and template, numbering, language — are in `.claude/profiles/delivery.md`
(*Decisions*). Missing profile: create it as `new-issue` describes.

## Is it really a human decision?

Decide yourself, and record the choice in the issue or PR in one line, unless the choice: costs real money; needs the
human's own accounts, hardware or presence; is destructive and irreversible in production; deviates from an accepted ADR or
a written principle; or has two readings that lead to materially different work. A question you can answer by reading the
repository, a related repository or the docs is answered, not asked.

## Ask

1. On the issue the work belongs to (or a new one via `new-issue`, type decision), add the profile's `needs-human` label
   (plus the decision label when it is architectural) and a section, in the profile's language, headed as the profile says
   (default `## What is needed from you`):
   - **Question**: one concrete question.
   - **Context**: what you found, with `path:line` and links; what is blocked until it is decided.
   - **Options**: two or three, each with its trade-off (cost, risk, reversibility, effort).
   - **Recommendation**: which one and why.
   - **How to answer**: e.g. "comment A or B".
2. Continue with work the decision does not block. Do not guess on an irreversible choice.
3. Tell the user in the final report, with the link and the question in one line.

## Session start: look for answers

When the profile says so (or when asked "anything waiting on me?"):
`gh issue list --label needs-human --state open`, and for each `gh issue view <n> --comments`: a comment from the human
newer than the last question means it is answered. Act on it (below) and report what was unblocked before other work.

## Record

When answered:

1. Write an ADR in the profile's ADR folder, numbered and templated as the existing ones (default:
   `docs/adr/NNNN-<slug>.md` with Status, Context, Decision, Consequences). Status *Accepted*; link the issue.
   Update the ADR index if the repository has one. A decision that replaces an earlier ADR marks that one *Superseded by*.
2. Comment the ADR link on the issue, remove `needs-human`, and close the issue if the decision was all it asked for;
   otherwise set it ready and carry on with `work-issue`.
3. If the decision changes a principle or convention, update `CLAUDE.md`/`AGENTS.md` in the same change.

Small decisions that set no precedent need no ADR: the issue comment is the record.
