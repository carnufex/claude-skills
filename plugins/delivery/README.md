# delivery

The path from an idea to verified production, the same in every repository, with each repository's facts in
`.claude/profiles/delivery.md`.

- **new-issue**: a de-duplicated, labelled issue in the right milestone, with testable acceptance criteria and a
  "how we'd notice it failing" line; marked ready only when someone could start without a question. Writes the profile
  on first use.
- **work-issue**: pick the next free issue (or the one named), claim it, comment a plan with its 3 am signal, branch in a
  worktree when the checkout is shared, build, record decisions and discovered work in the issue, unclaim when stopping.
  Ships `scripts/claim.mjs`: race-safe claims for parallel sessions (label + assignee + a claim comment; the oldest
  claim wins).
- **plan-milestone**: a goal with a checkable done-definition, split into ordered, linked issues; "where are we" reports
  that lead with what waits on a human; closing with a summary.
- **decision**: when a choice is not the agent's to make, a `needs-human` question with options and a recommendation;
  answered questions picked up at session start; every precedent-setting answer recorded as an ADR.
- **ship**: verify → PR (`Closes #n`, Verified, `3 am:`) → merge as the repository allows → GitOps deploy (automatic or by
  command) → verify the change live → close the loop; roll back by revert.

## Install

```text
/plugin marketplace add carnufex/claude-skills
/plugin install delivery@carnufex
```

## Profile

`.claude/profiles/delivery.md`, from `skills/new-issue/templates/profile.md`: *Language*, *Labels*, *Status and claims*,
*Milestones*, *Issue template*, *Branches and commits*, *Tests policy*, *Verify*, *Merge*, *Deploy*, *Live*, *Rollback*,
*When it breaks* and *Decisions*.
