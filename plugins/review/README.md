# review

Two reviews for two jobs.

- **review-sweep**: a whole codebase, or one area of it, reviewed across architecture, security, usability, modernity,
  reliability (including the 3 am question), performance, tests and docs. Reviewers run in parallel on a smaller model; the
  orchestrating session re-verifies, merges and de-duplicates, then files **one GitHub issue per verified finding** with the
  repository's labels.
- **review-hotspots**: one pull request or diff. A "Human review: look here first" map of at most three entries (where, why it
  is dangerous in *this* diff, what to verify by hand in a minute, verdict), ranked by hotspot, then at most five blocker or
  should-fix findings. No polish. Checks the linked issue's acceptance criteria and asks the 3 am question of every hotspot.
  When the diff touches the profile's person-reviewed paths, the map goes at the top of the PR description.

## Install

```text
/plugin marketplace add carnufex/claude-skills
/plugin install review@carnufex
```

## Profile

`.claude/profiles/review.md` in the reviewed repository, from `skills/review-sweep/templates/profile.md`: *Read first*,
*Areas*, *Project rules*, *Not a finding*, *Tests policy*, *Issues* (label scheme), *Hotspots*, *Person-reviewed paths* and
*Noise*. Both skills create it on first use if it is missing.
