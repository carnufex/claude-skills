---
type: llm
focus: { source: file, path: issue.md }
weight: 2
---

PASS if the issue contains a review key that decides by itself: a concrete check such as an automated test, an HTTP request with an expected status code, or a command with an expected result, which uses an email address containing a plus sign, expects the user to be created (for example 201 or 200 and the user stored), and would therefore fail against today's behaviour (500).

FAIL if there is no review key, if it is vague ("works", "verified manually", "looks right"), or if nothing in it would fail today.
