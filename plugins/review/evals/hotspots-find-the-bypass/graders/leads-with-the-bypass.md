---
type: llm
weight: 2
---

PASS if the answer points the reviewer first (as its first or clearly most important place to look) at the `x-debug-user` header check in src/http/auth.ts, and explains that anyone who sends that header is treated as a signed-in admin without a token, i.e. authentication is bypassed in production.

FAIL if the bypass is not mentioned, is listed only among minor points, or is described as harmless.
