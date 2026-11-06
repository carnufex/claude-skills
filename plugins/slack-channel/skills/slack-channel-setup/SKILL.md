---
name: slack-channel-setup
description: Set up, check or change the Slack channel — chatting in Slack with the Claude Code session that runs on the person's own computer. Creates the Slack app from the bundled manifest (the person does the clicks), stores the two tokens, writes the access list (which Slack users and channels may talk to the session), starts the session with the channel loaded, optionally at sign-in, and verifies the round trip. Use when asked to connect Claude Code to Slack, to talk to the local CLI from Slack or the phone, to allow another channel or user, or when the Slack channel does not answer.
---

# Slack channel setup

The plugin's MCP server (`server.mjs`) is a Claude Code **channel**: Claude Code starts it, it holds an outbound Socket
Mode WebSocket to Slack (nothing listens on the computer), forwards messages from allowlisted Slack users into the
running session, and gives Claude `reply`, `react` and `upload_file`. Tool approvals the session would ask in the terminal
also appear in Slack as **Allow / Deny** buttons (or `yes <id>` / `no <id>`). Whoever is on the allowlist can make the
session run commands on this computer: keep it to the person.

Configuration lives in `~/.claude/channels/slack/` (outside any repository): `.env` with the tokens, `access.json` with
the allowlist. Environment variables of the same names win over the files.

## 1. Slack app (the person does this; it needs their Slack account)

1. https://api.slack.com/apps → **Create New App** → **From a manifest** → their workspace → paste
   `slack-app-manifest.yaml` from this plugin → Create.
2. **Install to Workspace** → copy the **Bot User OAuth Token** (`xoxb-…`).
3. **Basic Information → App-Level Tokens → Generate Token and Scopes**, scope `connections:write` → copy (`xapp-…`).
4. Optional: a channel for it (e.g. `#claude`); invite the app there (`/invite @Claude Code`). A DM with the app works
   without any channel.

Tokens are secrets: the person pastes them into the file themselves, or stores them in their secrets manager and lets you
fetch them. Never echo a token back in chat or commit it.

## 2. Configure

```text
~/.claude/channels/slack/.env
SLACK_BOT_TOKEN=xoxb-…
SLACK_APP_TOKEN=xapp-…

~/.claude/channels/slack/access.json
{ "users": ["U…"], "channels": ["C…"], "dm": true, "requireMention": false, "announce": "C… or D…" }
```

- `users`: Slack user IDs allowed to talk to the session (profile → ⋯ → Copy member ID). The gate is on the sender, never
  the channel: anyone else in the channel is ignored.
- `channels`: channel IDs the session listens in (channel details → bottom). DMs with the app pass when `dm` is true.
- `requireMention`: only messages that mention the app, for a channel shared with other talk.
- `announce`: where it says "listening on <computer>" when it starts and "stopped" when it ends; also where tool approvals
  go before any conversation has started.

`access.json` is re-read on every message: changes apply without a restart. The tokens are read at start.

## 3. Start

```bash
echo '{ "env": { "SLACK_CHANNEL_LISTEN": "1" } }' > ~/.claude/channels/slack/listen-settings.json
claude --settings ~/.claude/channels/slack/listen-settings.json --dangerously-load-development-channels plugin:slack-channel@carnufex
```

**Exactly one session listens.** The plugin's server runs in every session where the plugin is enabled, but only the one
with `SLACK_CHANNEL_LISTEN=1` connects to Slack: Socket Mode spreads events over all open connections, so a second
listener would take messages away from the first. Every other session still has the tools and can post to Slack when
asked.

Custom channels are a research preview: Claude Code shows a confirmation for the development channel at every start
(choose *I am using this for local development*) and the flag does not work with `-p`. Start it in the folder the
session should work in, with `--add-dir` for others. The session's permission mode applies as usual; what would ask in
the terminal is relayed to Slack.

On Windows, `scripts/start.ps1` in this skill's directory opens it in its own Windows Terminal window; `start.ps1 -Register -Dir <folder>
[-AddDir <folder>]` starts it at every sign-in through a scheduled task, `-Unregister` removes that.

## 4. Verify

1. The terminal shows the channels notice for `plugin:slack-channel@carnufex`; with `announce` set, Slack gets
   "listening on …".
2. Send the app a DM ("which folder are you in?"): 👀 appears on the message at once, the answer arrives in the thread.
3. Ask for something that needs approval in the session's mode: the Allow/Deny message appears; the button closes the
   terminal dialog too.

## When it does not answer

| Symptom | Cause |
|---|---|
| No 👀 at all | session not running, not started with the flag, or the sender is not in `users`; `/mcp` in the session shows the server's state |
| `tokens missing` / `invalid_auth` in `claude --debug` output | `.env` missing or wrong token type (bot `xoxb-`, app `xapp-`) |
| 👀 in a channel but not in another | that channel is not in `channels`, or the app is not invited there |
| DMs to the app are refused by Slack | the app's Messages tab is off: reinstall from the manifest |
| Buttons do nothing | interactivity off in the app, or the clicker is not in `users` |
| `blocked by org policy` | a Team/Enterprise organisation must enable channels for Claude Code |

The tests (`tests/e2e.mjs`, run with `npm install && node e2e.mjs` in `tests/`) drive the server against a mock Slack
over stdio exactly as Claude Code does: run them after changing `server.mjs`.
