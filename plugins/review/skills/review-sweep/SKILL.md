---
name: review-sweep
description: Review a whole codebase, or one area of it, for architecture, security, usability, modernity, reliability (including whether on-call could debug it at 3 am), performance, tests and docs; verify every finding, drop duplicates and file one GitHub issue per verified finding with the repository's labels. Use when asked for a code review sweep, a health check of the code, an audit of an area, or "review everything and file issues". Not for reviewing one pull request (use review-hotspots).
---

# Review sweep

Arguments: an optional area from the profile's *Areas* table; empty means every area.

Review the code as its owner would want it reviewed: someone who lives with it for years, runs it in production and has to
defend it in a customer's security review. The result is a list of **verified findings filed as issues**, not an essay.

## Project profile

Project facts live in `.claude/profiles/review.md` in the repository under review: what to read first, the areas, the
project's own rules per dimension, what is not a finding, the test policy and the label scheme. The profile wins over the
defaults below wherever they disagree.

**If the profile is missing**, create it before reviewing: copy `templates/profile.md`, fill it from `CLAUDE.md`/`AGENTS.md`,
`docs/`, the ADRs, the solution layout and `gh label list`, and tell the user in one line that you wrote it. Leave a section
out rather than guess; never invent a rule the repository does not state.

## Read first (once, before judging anything)

1. `CLAUDE.md` / `AGENTS.md`: the principles and conventions. A finding that contradicts a written principle is stronger than
   one that contradicts taste.
2. Everything the profile lists under *Read first* (security model, threat model, ADR index, plans, roadmap). A residual risk
   written down there is not a finding unless the code no longer matches what the document claims; an accepted decision is not
   re-argued, but new evidence that it is wrong is a finding that names the evidence; deferred work is not a finding.
3. Existing issues, so nothing is filed twice: `gh issue list --state all --limit 500 --json number,title,state,labels`.

## What to look for

Work through every dimension for your area; skip one only if it truly does not apply. Add the profile's *Project rules* for
each dimension.

**Architecture and design**
- Layering and dependency direction as the project defines it; logic in the wrong layer; shared logic copied instead of shared.
- Size and cohesion: files and classes doing several jobs, methods too long to review, boolean parameter piles, request-scoped
  state in long-lived objects.
- Surface: features, settings, endpoints or pages that duplicate another or that nothing uses.
- Duplicated rules that can drift (two lists of the same markers, the same policy check written twice, copies of a DTO).
- Seams: the documented contracts are really used and components are replaceable as the docs claim.
- Config as code: anything configurable only in a UI or only in code when the project says it should be declarative.
- Data model: missing indexes for the queries that exist, unbounded tables without retention, migrations that break a rollback,
  nullable columns that are never null.
- Concurrency and jobs: leases, retries, idempotency, dropped cancellation tokens, `async void`, fire-and-forget work, shared
  mutable statics, unbounded caches.

**Security** (think like the reviewer of a customer's security team; STRIDE per trust boundary)
- Authorisation: every endpoint's role or ownership check, IDOR, tenant/workspace isolation, admin-only surfaces, token scopes.
- Injection and untrusted data: SQL, command and path handling (`..`, symlinks, zip slip), SSRF in every outbound fetch
  (redirects, DNS rebinding, internal and metadata IPs), prompt injection that changes policy, deserialisation, regex without
  timeouts, header and log injection, formula injection in exports.
- Secrets: anything that could reach logs, traces, errors, exports, a model or the browser; constant-time comparison; rotation;
  defaults that are unsafe outside development.
- Web: XSS, CSP gaps, open redirects, token storage, CORS, clickjacking, dependency confusion.
- Crypto and tokens: algorithms, key sizes, nonce reuse, JWT validation (alg, aud, iss, exp), replay protection.
- Denial of service: unbounded bodies, uploads, regex, loops, fan-out, bypassable quotas.
- Containers and supply chain: root, capabilities, writable mounts, unpinned base images and actions, unsigned artifacts, CI
  secrets reachable from untrusted code.
- Privacy: personal data retention, export and deletion completeness, PII in telemetry.

**Usability and accessibility**
- Dead ends: empty states, errors that say nothing actionable, destructive actions without confirmation or undo, settings that
  need a restart without saying so, internal jargon or ids shown to people.
- WCAG 2.2 AA: control names, focus management in dialogs, keyboard operation, contrast in every theme, live regions, motion
  preferences, touch target size.
- i18n: text outside the translation function, missing translations, dates and numbers not locale-formatted, concatenated strings.
- Responsive behaviour; large lists without virtualisation; re-render storms.
- Consistency: one thing named differently on different pages; different patterns for the same interaction.
- API and CLI ergonomics: error messages, exit codes, `--help`, defaults a new admin trips over.

**Modernity**
- Language and framework features the code could use now, and obsolete APIs it still uses (the profile names the versions).
- Dependencies that are unmaintained, end-of-life or have a clearly better supported successor; unused direct dependencies.
- Build and tooling: warnings that hide real problems, analyzers not enabled, scripts that only work on one OS.

**Reliability and operations**
- Failure behaviour: timeouts on every outbound call, retries with backoff and jitter, what happens when the database, a model,
  the IdP or a downstream service is away, partial failure in multi-step writes, startup ordering.
- **The 3 am question**: pick the area's busiest or riskiest flows and ask *if this broke at 3 am, what would on-call need to
  find it?* A failure path with no alert, a log line without the ids that localise it, an error swallowed or logged without
  context, or a trace that breaks across a queue or job boundary is a finding. Name the missing signal, not "add observability".
- Metrics with unbounded label cardinality; alerts that can never fire or never stop.
- Upgrade, backup and restore safety; settings that differ between deployment targets without saying so.

**Performance and cost**
- N+1 queries, whole tables or large blobs loaded into memory, per-request work that belongs in a worker, repeated model or
  embedding calls that could be cached, prompt text that costs tokens for nothing.

**Tests and CI**
- Only where the profile's *Tests policy* says tests carry value (by default: authorisation and policy rules, security and data
  boundaries, logic that is easy to get wrong, regression-prone bugs). Name the specific missing case, never "more tests".
- Flaky tests (time, ports, ordering), tests that assert nothing, tests that mirror the implementation.

**Documentation and consistency**
- A claim in `CLAUDE.md`, `AGENTS.md`, `docs/` or a comment that the code no longer matches. Doc drift is a finding because the
  documentation is also the agents' working memory.

**Simplification**
- Dead code, unused options, parallel implementations of one thing, abstractions with a single caller that add nothing.

## What is not a finding

Formatting and naming taste; "consider", "might" or "could in theory" without a concrete scenario; anything an existing
analyzer, CI gate or accepted ADR already covers; deferred plans; third-party and generated code; micro-optimisations without a
measured or obviously quadratic cost; anything you cannot point at a line for; everything the profile lists under *Not a finding*.

## How to verify (every finding, before it is written down)

1. Read the cited code again, including its callers; say which path reaches it.
2. State the failure as a concrete scenario: input or state, then the wrong result. Run a test or a command when it is cheap
   (a filtered test run, `rg`, a small script). A security finding needs the route from an attacker's capability to the impact,
   not only a pattern match.
3. Look for the control that would make it moot (middleware, a guard, a database constraint, a test that pins the behaviour).
4. Mark it `verified` when steps 1-3 hold, otherwise `plausible` and write what would confirm it. Drop what you cannot make
   plausible.

## Output of a reviewer (nothing in the repository changes)

Return the findings as text in the final answer; subagents cannot hand back files, and the orchestrator keeps only what comes
back. One section per finding, highest severity first, at most 15:

```
### F1: <imperative, specific title, at most 80 characters>
- dimension: architecture | security | usability | modernity | reliability | performance | tests | docs | simplification
- severity: high | medium | low        (high: exploitable, data loss or wrong decisions; medium: real defect or clear cost; low: worth fixing)
- confidence: verified | plausible
- type: <from the profile's label scheme, default bug | chore | feature>
- area: <from the profile's label scheme>
- where: path:line, path:line
- finding: what is wrong, in two to four sentences
- evidence: the scenario, and what you ran or read to confirm it
- impact: who or what it hurts
- fix: the direction, and the smallest change that closes it
- acceptance: how we will know it is fixed (a test, a command, an observable behaviour)
```

End with a short `## Coverage` section: what you read, what you did not, and anything noticed outside your area.

## The orchestrator (the session that runs the sweep)

1. Split the work by the profile's *Areas* table and give each reviewer this skill, its area, and the instruction to change no
   repository file and create no issues. Reviewers run on a smaller model (`sonnet`); the orchestrator owns correctness. A large
   area takes a reviewer 10-20 minutes; if one dies on an expired login, probe with a one-word agent and start it again.
2. When the answers are in: re-open the cited lines of every `high` finding and a sample of the rest, drop what does not hold,
   merge findings with one root cause into one issue (list every `where`), and link duplicates of existing issues instead of
   filing them again.
3. Create missing labels once: `review-sweep`, `severity:high`, `severity:medium`, `severity:low`, plus whatever the profile's
   label scheme needs.
4. File one issue per finding: `gh issue create --title ... --label "<labels per the profile>" --body-file ...`. Body: Finding,
   Where, Evidence, Impact, Fix direction, Acceptance (the reviewer's words, tightened). Exploitable security findings describe
   the impact and the fix, not a ready-made attack, and are reported to the owner at once in the final report.
5. Final report: findings per dimension and severity, the issue links, what was dropped and why, the areas and files covered,
   and what was not reviewed. Write a copy into the repository only if the owner asks (the profile may name where).
