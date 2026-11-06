#!/usr/bin/env node
// Post a PR demo to Slack as the bot, so the people in the channel get a real notification.
//
//   node post-slack.mjs --channel <C…> --file demo.mp4 [--title "…"] [--comment-file message.md | --comment "…"] [--thread <ts>]
//
// The bot token comes from SLACK_BOT_TOKEN, else from ~/.claude/channels/slack/.env (the slack-channel plugin's file).
// The bot must be a member of the channel and have files:write (and files:read for the permalink). Slack's
// three-step external upload: files.getUploadURLExternal → POST the bytes → files.completeUploadExternal.
// Prints {"file": id, "permalink": url} and exits 0, or the Slack error and exits 1.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const channel = opt('--channel');
const file = opt('--file');
if (!channel || !file) { console.error('usage: post-slack.mjs --channel <id> --file <path> [--title t] [--comment-file f | --comment c] [--thread ts]'); process.exit(2); }

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
  if (!json.ok) { console.error(`${method}: ${json.error}${json.error === 'not_in_channel' ? ' (invite the bot: /invite @<bot>)' : ''}`); process.exit(1); }
  return json;
}

const bytes = fs.readFileSync(file);
const name = path.basename(file);
const comment = opt('--comment-file') ? fs.readFileSync(opt('--comment-file'), 'utf8') : opt('--comment');
const up = await slack('files.getUploadURLExternal', { filename: name, length: String(bytes.length) }, true);
const put = await fetch(up.upload_url, { method: 'POST', body: bytes });
if (!put.ok) { console.error(`upload: http ${put.status}`); process.exit(1); }
await slack('files.completeUploadExternal', {
  files: [{ id: up.file_id, title: opt('--title') || name }],
  channel_id: channel,
  ...(opt('--thread') ? { thread_ts: opt('--thread') } : {}),
  ...(comment ? { initial_comment: comment } : {}),
});
let permalink = null;
try { permalink = (await slack('files.info', { file: up.file_id }, true)).file.permalink; } catch { /* optional */ }
console.log(JSON.stringify({ file: up.file_id, permalink }));
