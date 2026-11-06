---
name: review-key
description: Write, freeze and run an issue's review key — the check, decided before any code, that says when the work is done and that the implementer cannot move. Parity with a legacy system (identical output on a corpus or on recorded traffic), shadow traffic, bit-exact output, a spec or conformance suite, an eval threshold, or a measured UI behaviour. Use when writing an issue (every ready issue has one), when starting work on an issue (commit the key first), when asked "is it done?", when porting or rewriting something that must behave the same, and before a pull request, where an independent key-reviewer agent must pass it.
---

# Review key

A review key is the answer to "how do we know it is done?", written **before** the work and **frozen** while it is done.
An agent works until the key passes; a second agent that did not write the code checks that it really passes and was not
gamed. A person then reviews a verdict and a demo, not a diff.

## What makes a good key

- **Decides by itself.** A command that exits 0 or not, or two outputs that are identical or not. "Looks right" is not a key.
- **Discriminates.** It fails on the code as it is today (for a bug or a feature) and passes only when the work is done.
  A key that already passes on the default branch proves nothing.
- **Independent of the implementation.** It tests behaviour from the outside (HTTP, CLI, the browser, files out), not
  private functions the implementation is free to rename.
- **Normalisation declared up front.** Timestamps, ids, ordering, whitespace: which differences do not count is part of
  the key, not something the implementer decides when a case fails.
- **Cheap enough to run every round** (minutes, not hours). A slow, full version can run in CI as well.
- **Covers the edges.** A parity corpus includes the ugly cases: empty, huge, unicode, errors, permissions denied.

## Kinds

| Kind | The key is | Typical use |
|---|---|---|
| `parity` | the same input to legacy and candidate gives the same output (after normalisation), for every case in a corpus; legacy may be `"recorded"` — a golden master captured once | a 1:1 port of a legacy API, a rewrite, a refactor that must not change behaviour |
| `shadow` | parity on **recorded real traffic** (requests captured from production or a mirror) replayed against both | replacing a live API path; a shadow route before the switch |
| `bit-exact` | parity on bytes (sha256 of each output file) | file formats, exports, codecs, build outputs |
| `spec` | a conformance suite or a list of checks each of which must pass (OpenAPI contract tests, an RFC's test vectors, an e2e check that measures the behaviour) | new behaviour, bugs, UI |
| `eval` | a metric from a command meets a threshold (`atLeast`/`atMost`), ideally "not worse than the baseline" | models, retrieval, prompts, performance budgets |
| `judgement` | none of the above is possible: who decides and what exactly they look at | design taste, copy; use rarely and say why |

Shadow traffic in production (mirroring a route and counting differences) is a deploy-time key: write it as a `spec` check
that queries the difference metric (`... | grep -q 'diff_total 0'`) and say over which window.

## The two places a key lives

1. **In the issue**, a section headed as the profile says (default `## Review key`), in plain words: the claim, the
   kind, the corpus or checks, the normalisation, and what "done" is ("all 312 recorded requests identical, `$.generatedAt`
   ignored"). This is what a person approves.
2. **In the repository**, `.review-keys/<n>.json`, the same key in a form `scripts/keycheck.mjs` runs. Corpus files,
   recorded goldens and check scripts the key relies on are listed in `oracle`. They belong to the key, not the code.

```json
{
  "issue": 42,
  "kind": "parity",
  "claim": "The new /v2/invoices returns exactly what the legacy /invoices returns for every recorded request.",
  "oracle": ["review-keys/42/requests.jsonl", "e2e/review-keys/42-totals.mjs"],
  "checks": [
    { "name": "totals in the browser", "run": "node e2e/review-keys/42-totals.mjs" },
    { "name": "p95 latency", "run": "node perf/p95.mjs /v2/invoices", "metric": "p95_ms=([0-9.]+)", "atMost": 150 }
  ],
  "parity": {
    "cases": "review-keys/42/requests.jsonl",
    "legacy": { "url": "http://localhost:8080" },
    "candidate": { "url": "http://localhost:8081" },
    "compare": "json",
    "normalize": { "ignore": ["$.generatedAt", "$.items[*].etag"], "sortArrays": ["$.items"] },
    "min": 300
  }
}
```

- `checks[]`: `run` (bash on every platform), optional `cwd`, `timeoutSec`, `expectExit` (default 0), `expectOutput`
  (regex), or `metric` (regex with one group) with `atLeast`/`atMost`.
- `parity`: `cases` (a `.jsonl`/`.json` file or an inline array). A case has `id` and, per target, `request`
  (`method`, `path`, `headers`, `body`) for `{url}` targets, or `args`/`input`/`stdin` for `{run}` targets, whose command
  may use `{args}`, `{input}`, `{id}` and `{out}` (a file to write; then the file is compared, not stdout). `legacy` may
  be `"recorded"`: each case then carries `expected` (and `expectedStatus`). `compare`: `json` (default), `text` or
  `bytes`. `normalize`: `ignore` and `sortArrays` (paths like `$.a.b[*].c`), `replace` (`[["regex", "by"]]`, applied to
  the raw text first). `min`: the fewest cases that count. HTTP status codes are compared unless `compareStatus: false`.

## Freeze

The key goes in **the first commit of the branch**, alone: `.review-keys/<n>.json` plus its oracle files, message
`Review key for #<n>`. Comment the key's hashes on the issue (`node scripts/keycheck.mjs hash <n>`). From then on:

- `keycheck.mjs run` fails if the key file or any oracle path changed since that commit (committed or not, new files in
  an oracle folder included).
- The implementer never edits the key or its oracle. A key that turns out wrong (a case that is legitimately different,
  a normalisation that was missed) is a **human decision**: say why on the issue (`decision`), and after the answer
  commit the change as its own `Review key for #<n>: <what changed>` commit — which the reviewer then sees and must call out.

## Run it

From the repository root (the issue's branch, with whatever the checks need running — the profile's *Review keys* says how
to start legacy and candidate):

```bash
node <this skill's directory>/scripts/keycheck.mjs run <n>     # PASS/FAIL, evidence in out/review-key/<n>/
node <this skill's directory>/scripts/keycheck.mjs hash <n>    # the oracle's hashes, for the issue comment
```

`result.json` and `summary.md` in `out/review-key/<n>/` (or the profile's git-ignored folder, `--out <dir>`) are the
evidence the PR, the reviewer and the demo use.

While implementing a UI or service key, keep what the check needs running and run the check's inner command directly
for fast rounds (seconds instead of minutes); run the full `keycheck.mjs run` before asking the reviewer.

## The loop: implementer and reviewer

1. **Implementer** (the session doing `work-issue`): commits the key, then implements until `keycheck.mjs run <n>` passes
   locally, running it every round instead of reasoning about whether it would pass.
2. **Reviewer**: when it passes, spawn the `key-reviewer` agent (this plugin's agent; `subagent_type` `key-reviewer`, or
   `delivery:key-reviewer` when namespaced). Give it only: the repository path, the branch, the issue number and the
   base branch — **not** your reasoning or your summary of the change. It runs the key itself in a clean worktree, runs it
   on the base to prove it discriminates, and reads the diff for gaming. It answers `PASS`, `FAIL` or `KEY-WEAK`.
   If the agent is not available in the session (the plugin is enabled for the repository but not installed yet), spawn a
   general-purpose agent on `sonnet` whose prompt is the whole body of `agents/key-reviewer.md` plus the four inputs, the
   keycheck path and what the profile says the checks need (ports, stacks, run order). Stop any stack you keep running for
   yourself first: the reviewer starts its own.
3. `FAIL`: fix what it found, run the key, ask again. After three rounds without `PASS`, stop: comment the state on the
   issue and ask the human (`decision`).
4. `KEY-WEAK` (the key passes on the base, or could pass without the work): the key must be strengthened — a human
   decision as above, never silently.
5. `PASS`: the reviewer's verdict (its summary, verbatim) goes in the PR under **Review key**, and `ship` continues.

The reviewer cannot edit files. It does not fix; it gives evidence.
