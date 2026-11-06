# slack-channel

Chat in Slack with the Claude Code session running on your own computer — not a cloud session: the one with your files,
your tools, your cluster access.

It is a Claude Code [channel](https://code.claude.com/docs/en/channels): an MCP server (`server.mjs`, Node 22+, no
dependencies) that Claude Code starts with the session. It keeps an outbound Slack Socket Mode connection, so nothing on
your machine is exposed.

- Messages from allowlisted Slack users (in a DM with the app or in chosen channels) arrive in the session; 👀 marks them
  received.
- Claude answers in the same thread with `reply` (Markdown), reacts with `react`, and shares screenshots, videos and
  reports with `upload_file`. Files you attach in Slack are saved locally for it to read.
- Tool approvals the session would ask in the terminal appear in Slack as **Allow / Deny** buttons.
- Optional "listening on <computer>" / "stopped" messages, so you know whether anyone is home.

**slack-channel-setup** (skill) walks through the Slack app (from `slack-app-manifest.yaml`), the tokens, the access list,
starting the session (`skills/slack-channel-setup/scripts/start.ps1`, also at sign-in) and checking the round trip.

```bash
claude --dangerously-load-development-channels plugin:slack-channel@carnufex
```

Custom channels are a research preview: the flag asks for confirmation at each start and does not work with `-p`.

## Install

```text
/plugin marketplace add carnufex/claude-skills
/plugin install slack-channel@carnufex
```

## Security

Anyone on the allowlist can make the session run commands on your computer and approve its tool use. The server gates on
the sender's Slack user ID (never the channel), ignores bots and its own messages, and drops everything else silently.
Tokens live in `~/.claude/channels/slack/.env`, outside any repository.

## Test

`cd tests && npm install && node e2e.mjs` runs the server against a mock Slack (Web API and Socket Mode) over stdio, the
way Claude Code talks to it: handshake, sender gating, threads, long replies, both approval paths, uploads, reconnect and
shutdown.
