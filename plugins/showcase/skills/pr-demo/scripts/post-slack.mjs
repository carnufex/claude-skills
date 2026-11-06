#!/usr/bin/env node
// Post about a pull request to Slack as the bot, one thread per PR, so the channel gets a real notification.
//
//   node post-slack.mjs --channel <C…> --pr <PR url> --file demo.mp4 --title "…" --comment-file message.md
//   node post-slack.mjs --channel <C…> --pr <PR url> --text-file update.md [--broadcast]
//   node post-slack.mjs --channel <C…> --pr <PR url> --find
//
// --pr: the PR's thread is the channel's top-level message that contains the PR url (looked up in the channel's
//       history, no state kept). Found: this post goes into that thread. Not found: this post starts it.
// --file uploads a file (the demo video) with --comment-file/--comment as its message; --text-file/--text posts a
//       message only (CI, review, merge, deploy, live check). --broadcast also shows a thread reply in the channel.
// --find prints the PR's thread ts (or null) and posts nothing.
// The bot token comes from SLACK_BOT_TOKEN, else from ~/.claude/channels/slack/.env (the slack-channel plugin's file).
// The bot must be in the channel, with chat:write, files:write, channels:history (files:read for the permalink).
// Prints {"thread": ts|null, "ts": ts?, "file": id?, "permalink": url?} and exits 0, or the Slack error and exits 1.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n) => args.includes(n);
const channel = opt('--channel');
const pr = opt('--pr');
const file = opt('--file');
const text = opt('--text-file') ? fs.readFileSync(opt('--text-file'), 'utf8') : opt('--text');
if (!channel || (!file && !text && !flag('--find')) || (flag('--find') && !pr)) {
  console.error('usage: post-slack.mjs --channel <id> [--pr <url>] (--file <path> [--title t] [--comment-file f | --comment c] | --text-file f | --text t | --find) [--thread ts] [--broadcast]');
  process.exit(2);
}

function token() {
  if (process.env.SLACK_BOT_TOKEN) return process.env.SLACK_BOT_TOKEN;
  try {
    const env = fs.readFileSync(path.join(os.homedir(), '.claude', 'channels', 'slack', '.env'), 'utf8');
    const m = env.match(/^\s*SLACK_BOT_TOKEN\s*=\s*['"]?([^'"\r\n]+)/m);
    if (m) return m[1].trim();
  } catch { /* none */ }
  console.error('no bot token: set SLACK_BOT_TOKEN or ~/.claude/channels/slack/.env'); process.exit(2);
}
const TOKEN = token();
const API = (process.env.SLACK_API_BASE || 'https://slack.com/api').replace(/\/$/, '');

async function slack(method, body, form = false) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json; charset=utf-8' },
    body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }));
  if (!json.ok) throw new Error(`${method}: ${json.error}${json.error === 'not_in_channel' ? ' (invite the bot: /invite @<bot>)' : ''}`);
  return json;
}

/** The ts of the channel's top-level message that mentions the PR url, newest first, up to 1000 messages back. */
async function findThread(url) {
  const needle = url.replace(/\/+$/, '');
  let cursor;
  for (let page = 0; page < 5; page++) {
    const r = await slack('conversations.history', { channel, limit: '200', ...(cursor ? { cursor } : {}) }, true);
    for (const m of r.messages || []) {
      if (m.thread_ts && m.thread_ts !== m.ts) continue; // a broadcast reply, not a thread's start
      const hay = `${m.text || ''} ${JSON.stringify(m.blocks || [])} ${(m.files || []).map((f) => f.title || '').join(' ')}`;
      if (hay.includes(needle)) return m.ts;
    }
    cursor = r.response_metadata?.next_cursor;
    if (!cursor) break;
  }
  return null;
}

// Errors end the process through exitCode, not process.exit: exiting while a fetch socket closes asserts in Node on Windows.
let thread = null;
main().catch((e) => { console.error(e.message); process.exitCode = 1; });

async function main() {
  thread = opt('--thread') || (pr ? await findThread(pr) : null);
  if (flag('--find')) console.log(JSON.stringify({ thread }));
  else await post();
}

async function post() {
const inThread = thread ? { thread_ts: thread, ...(flag('--broadcast') ? { reply_broadcast: true } : {}) } : {};

if (file) {
  const bytes = fs.readFileSync(file);
  const name = path.basename(file);
  const comment = opt('--comment-file') ? fs.readFileSync(opt('--comment-file'), 'utf8') : opt('--comment');
  const up = await slack('files.getUploadURLExternal', { filename: name, length: String(bytes.length) }, true);
  const put = await fetch(up.upload_url, { method: 'POST', body: bytes });
  if (!put.ok) throw new Error(`upload: http ${put.status}`);
  await slack('files.completeUploadExternal', {
    files: [{ id: up.file_id, title: opt('--title') || name }],
    channel_id: channel,
    ...(thread ? { thread_ts: thread } : {}),
    ...(comment ? { initial_comment: comment } : {}),
  });
  let permalink = null;
  try { permalink = (await slack('files.info', { file: up.file_id }, true)).file.permalink; } catch { /* optional */ }
  console.log(JSON.stringify({ thread, file: up.file_id, permalink }));
} else {
  const r = await slack('chat.postMessage', { channel, text, unfurl_links: false, ...inThread });
  console.log(JSON.stringify({ thread: thread || r.ts, ts: r.ts }));
}
}
