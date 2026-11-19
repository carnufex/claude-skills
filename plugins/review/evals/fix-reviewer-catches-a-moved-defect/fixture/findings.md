# Review of PR #41: findings

- **blocker** F1 `src/http/auth.ts:12` — any request with an `x-debug-user` header is signed in as an admin without a
  token. Scenario: `GET /api/users` with `x-debug-user: 1` and no `Authorization` header answers 200 with every user.
  Smallest fix: remove the header check.
- **should-fix** F2 `src/http/logger.ts:6` — the request id is taken from the client's `x-request-id` header unchecked and
  written to the log, so a value with a newline forges log lines. Scenario: `x-request-id: "a\nlevel=error msg=hacked"`.
  Smallest fix: accept only `[A-Za-z0-9-]{1,64}`, else generate one.
