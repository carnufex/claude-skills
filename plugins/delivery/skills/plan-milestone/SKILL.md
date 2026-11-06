---
name: plan-milestone
description: Plan, review and close GitHub milestones (or the repository's plans file when it uses one instead) — turn a goal into a milestone with a done-definition and ordered, dependency-linked issues; report a milestone's real state (done, in progress, blocked, waiting on a human, stale claims, scope creep); and close it with a summary when its done-definition holds. Use when asked to plan a milestone, phase, release or epic, to break a goal into issues, for "where are we on <milestone>", "what is left", or to close or re-scope a milestone.
---

# Plan a milestone

Repository facts are in `.claude/profiles/delivery.md` (*Milestones*: whether the repository uses GitHub milestones, a
plans file, or a project board, and how they are named). Missing profile: create it as `new-issue` describes.

## Plan

1. **Goal and done.** One paragraph: what is true when the milestone is done, from a user's or operator's point of view,
   and how it is checked (a demo, a command, a metric). A milestone without a checkable done-definition is a wish list.
2. **Existing work first.** `gh issue list --state open --limit 500` and the plans/roadmap docs the profile names: move
   issues that belong here into it instead of writing new ones.
3. **Split** into issues with `new-issue`. Each issue is one PR's worth, has testable acceptance criteria and ships on its
   own without breaking production. Work that must land together is one issue, or is ordered with a feature flag.
4. **Order and link.** Dependencies as "Blocked by #<n>" in the issue body; the first issues are the ones that unblock the
   most or retire the biggest risk (a spike before the build that depends on its answer). Decisions the milestone needs go
   first, as `decision` issues.
5. **Operability.** If the milestone puts something new into production, one of its issues (or each issue's criteria)
   covers the 3 am question: the alert and the log or trace that would show it broken.
6. **Create** the milestone, unless it exists: `gh api repos/{owner}/{repo}/milestones -f title="<title>" -f
   description="<goal and done>" [-f due_on=<ISO date>]`. With a plans file instead, add the entry in the file's format.
   Set the issues' milestone (`gh issue edit <n> --milestone "<title>"`).
7. **Report** the milestone link, the ordered issue list with dependencies, and what needs a human first.

## Review ("where are we")

`gh issue list --milestone "<title>" --state all --json number,title,state,labels,assignees,updatedAt` and the claim list
(`work-issue`). Report, in this order:

- done vs total, and whether the done-definition is closer;
- **waiting on a human** (`needs-human`): the question in one line each — these block the most;
- blocked, and by what;
- in progress, with claims older than a few days and no commits flagged as stale (ask before releasing someone else's);
- scope creep: issues added after the milestone started, and whether they belong in it.

## Close

Close only when the done-definition holds, checked, not assumed. Move open leftovers to the next milestone (say which and
why), then close: `gh api -X PATCH repos/{owner}/{repo}/milestones/<number> -f state=closed`. Post or record a short summary
(what shipped, what moved, what was learned) where the profile says, else in the reply.
