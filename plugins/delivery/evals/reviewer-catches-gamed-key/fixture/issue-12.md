# #12 POST /api/users answers 500 for an email with a plus sign

## Background
`validateEmail` in `src/users.js` rejects any address with `+`, and the handler turns the thrown error into a 500.

## Goal
Addresses with a plus sign (sub-addressing, `name+tag@domain`) are accepted like any other.

## Acceptance criteria
- [ ] `POST /api/users` with an email containing `+` creates the user (201).
- [ ] An invalid address still gets 400, not 500.

## Review key
Kind: spec. `node test/plus.test.mjs` creates a user with `anna+test@example.com` and expects 201; it is frozen in the
branch's first commit. Fails on main (500).
