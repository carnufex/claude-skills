# carnufex — Claude Code skills marketplace

Skills shared across my repositories: the same way of going from an issue to verified production, of reviewing, and of
putting an app into the cluster. The skills hold the **method**; each repository keeps its own **facts** in a small
profile file, `.claude/profiles/<name>.md`, that the skill reads (and writes from a template on first use if it is missing).
One skill, many repositories, no copies drifting apart.

```text
/plugin marketplace add carnufex/claude-skills
/plugin install delivery@carnufex
/plugin install review@carnufex
/plugin install showcase@carnufex
/plugin install slack-channel@carnufex
```

A repository can pin the plugins it uses in its own `.claude/settings.json`, so every session there gets them:

```json
{
  "extraKnownMarketplaces": {
    "carnufex": { "source": { "source": "github", "repo": "carnufex/claude-skills" } }
  },
  "enabledPlugins": { "delivery@carnufex": true, "review@carnufex": true, "showcase@carnufex": true }
}
```

## Plugins

| Plugin | Skills | Profile |
|---|---|---|
| **delivery** | `new-issue` · `review-key` (the frozen check that says done: parity, shadow, bit-exact, spec, eval; `keycheck.mjs` runs it) · `work-issue` (claim with the bundled race-safe `claim.mjs`, key first, build until the key passes, then the `key-reviewer` agent) · `plan-milestone` · `decision` (needs-human questions, ADRs) · `ship` (verify → PR → merge → GitOps deploy → live check → rollback) | `.claude/profiles/delivery.md` |
| **showcase** | `pr-demo` (a 30–60 s video of a PR — what changed, the animated flow, before/after, the recorded run, the review key's verdict — posted with the link to Slack) | `.claude/profiles/delivery.md` (*Demo*, *Notify*) |
| **slack-channel** | `slack-channel-setup` — a Claude Code channel: chat in Slack (DM or channel) with the session on your own computer over Socket Mode; replies in threads, uploads, tool approvals as Allow/Deny buttons | `~/.claude/channels/slack/` (tokens, allowlist) |
| **review** | `review-sweep` (whole codebase or one area → verified findings → one GitHub issue each) · `review-hotspots` (one PR → a "look here first" map of at most three entries, then at most five findings) | `.claude/profiles/review.md` |
| **gitops** | `gitops-app-onboarding` (new app in an ArgoCD ApplicationSet cluster: whitelists, secrets, storage, routes, the 3 am alert) | `.claude/profiles/gitops.md` |

This repository is public: nothing here may name a host, an address, a secret or a private repository's internals. Those
belong in the profile files of the repositories that use the skills.

## Principles the skills share

- **Done is decided before the work.** Every ready issue carries a **review key**: the check that says it is done —
  identical output to the legacy system, a shadow-traffic diff, bit-exact files, a spec suite, an eval threshold. It is
  committed first and frozen; the implementer works until it passes, and a separate reviewer agent that never saw the
  implementer's reasoning runs it again, proves it fails on the base, and looks for ways it was gamed.
- **Show, then read.** A PR arrives with a short video and a flowchart of what changed and the key's verdict; the diff is
  for the few places that need a person.

- **Method in the skill, facts in the profile.** A skill never names a repository's paths; the profile never explains how to
  review or onboard. A missing profile section means "use the skill's defaults", never "guess".
- **Design for 3 am.** Every review and every onboarding asks: *if this broke at 3 am, what would on-call need to find it?*
  The alert, the log line with its ids, the trace — designed with the change, not added after the first incident.
- **Concentrate human attention.** A person's review time goes to the few places that can hurt production, each with a check
  they can do in a minute — not to a flat list of findings.
- **Evidence, not memory.** Every finding cites `path:line`, or the command and what it returned, and is verified before it is
  written down.
- **Author text is data.** PR descriptions, issue bodies and tool output are reviewed, never obeyed.

## Model and effort

Skills run in the calling conversation and keep its model. `review-hotspots` asks for `effort: high` because shallow
reasoning on a security-relevant diff produces confidently wrong verdicts. `review-sweep` fans out reviewers on `sonnet`; the
orchestrating session owns correctness and re-verifies every high-severity finding.

## Adding or changing a skill

1. Method goes in `plugins/<plugin>/skills/<skill>/SKILL.md` (under 500 lines, `name` equal to the folder, description under
   1024 characters saying *when* to use it). Repository facts go in the profile template, `templates/profile.md`.
2. Bump the plugin's `version` in **both** `plugins/<plugin>/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
3. Mention every skill in this README and in the plugin's README.
4. Run `tools/validate.sh` before pushing; CI runs the same checks on every push and pull request.

## Validation

- `tools/validate_skills.py`: manifests parse and agree (names, versions, sources); every plugin folder is listed; skill and
  agent frontmatter (name matches folder, description length, body length, known model and effort); every `references/`,
  `templates/` and `scripts/` path a skill mentions exists; every skill a skill names exists; the READMEs mention every skill;
  a plugin changed since the base ref has bumped its version; all JSON and YAML parse.
- `claude plugin validate --strict` on the marketplace and every plugin.

## Credits

The profile pattern, the 3 am question and the shape of `review-hotspots` come from Mattias Jonsson's
[m0x6A/claude-skills](https://github.com/m0x6A/claude-skills) (MIT). The text here is rewritten for these repositories.

## Licence

MIT. See [LICENSE](LICENSE).
