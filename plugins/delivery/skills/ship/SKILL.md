---
name: ship
description: Take finished work from a branch to verified production — run the repository's verification, open the pull request (Closes #n, what was verified, the 3 am signal), merge it the way the repository allows, deploy (automatic on merge or by the repository's deploy command into the GitOps repo), verify the change live, close the loop on the issue, and roll back by revert when it breaks. Use when an issue is implemented and ready to ship, when asked to open a PR, merge, deploy, release, redeploy or roll back, or when production misbehaves after a deploy.
---

# Ship

"Done" means running in production and checked there, not merged. Repository facts — verify commands, PR format, who may
merge, how deploys happen, where production is, how to roll back and the usual failures — are in
`.claude/profiles/delivery.md`. Missing profile: create it as `new-issue` describes.

## 1. Verify before the PR

On the branch rebased on the latest default branch (`git fetch origin && git rebase origin/<default>`):

1. Every acceptance criterion in the issue is met, or the rest is split into new issues linked "Found in #<n>".
2. Run the profile's *Verify* commands for what the change touches. They must pass; paste the summary into the PR.
3. User-visible change: look at it running (local stack, preview, browser check) and keep a screenshot or what you saw.
4. Docs, ADRs and design documents the change affects are updated in the same branch.
5. **3 am**: the change's failure would show up somewhere a person sees it (the signal named in the plan, existing or
   added). Write it in the PR as `3 am: <signal>`; pure refactors, copy and styling are exempt.

## 2. Pull request

`git push -u origin <branch>` and `gh pr create --title "<profile's PR title format>" --body-file <file>`. Body per the
profile's template (else: what and why, `Closes #<n>`, **Verified** — what you ran and saw, `3 am:` line, screenshots).
Stage explicit paths only; `git fetch` before every push — other sessions push to the same repository.

If the diff touches the paths the review profile marks as person-reviewed (`.claude/profiles/review.md`), run the
`review-hotspots` skill (review plugin) and put its map at the top of the PR description, then stop and ask for the review.

## 3. Merge

Follow the profile's *Merge* rules exactly: who decides that it ships (merging can be deploying), the merge method (default
squash, branch deleted), and whether the default branch may only change through PRs. Merge only when verification passed
on the branch as it is now. When the profile says a person decides and they have not, stop with the PR open and say it is
ready to ship.

## 4. Deploy

As the profile's *Deploy* says:

- **Automatic on merge** (a pipeline builds, pushes, signs and bumps the GitOps pin): find the run for the merge commit
  and watch it to the end (`gh run list --limit 3`, `gh run watch <id> --exit-status`). A failed run is fixed by a new PR or
  a re-run, never by building or pinning by hand — unless the profile's fallback says the pipeline itself is down.
- **By command** (a script builds, pushes and bumps the GitOps repository): run it from a clean, up-to-date default branch,
  never from a feature branch or a dirty tree. A busy main checkout → a detached worktree at `origin/<default>`.
- Either way the deploy is GitOps: the pin lands in the cluster repository and ArgoCD rolls it out. Never edit the pin or
  `kubectl set image` by hand outside the profile's documented fallback.

## 5. Verify live

Report the deploy as done only after:

1. the rollout finished (the profile's command, or the new pods ready with the new image tag);
2. the health check answers (profile: *Live*);
3. **the change itself** is observed in production — open the page, call the endpoint, play the feature — not only that
   the site is up;
4. migrations, if any, applied (their log).

## 6. Close the loop

Comment on the issue: the deployed version (tag or commit), what you checked live, numbers when relevant. The PR's
`Closes #<n>` closes it; release the claim and clear in-progress status (`work-issue`), or move the board card to *Done*.

## Roll back

Revert, do not patch around: revert the PR (or, when the profile says so, the deploy commit in the GitOps repository) and let
the normal path deploy the revert. The default branch stays the truth about what runs. Migrations do not roll back with
the image, which is why destructive schema changes ship in expand/contract steps. Production broken: roll back first,
then fix on a branch.

## When it breaks

Walk the profile's *When it breaks* table first. Otherwise top-down: the pipeline or deploy log → the GitOps commit →
ArgoCD sync → pods and events → the app's logs → the route. The cluster's own diagnostics skill, if the profile names one,
has the order and commands.
