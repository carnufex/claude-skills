#!/usr/bin/env node
// Slack channel for Claude Code: chat in Slack with the Claude Code session running on your own computer.
//
// Claude Code starts this as an MCP server over stdio (see .mcp.json) when the session is launched with
//   claude --dangerously-load-development-channels plugin:slack-channel@carnufex
// It keeps an outbound Socket Mode WebSocket to Slack (nothing listens on your machine), pushes messages from
// allowlisted Slack users into the session as <channel> events, gives Claude reply/react/upload tools, and relays
// tool-permission prompts to Slack as Allow/Deny buttons.
//
// No dependencies: Node 22+ (global fetch and WebSocket). Configuration, all optional except the two tokens:
//   ~/.claude/channels/slack/.env          SLACK_BOT_TOKEN=xoxb-…  SLACK_APP_TOKEN=xapp-…  (environment variables win)
//   ~/.claude/channels/slack/access.json   { "users": ["U…"], "channels": ["C…"], "dm": true,
//                                            "requireMention": false, "announce": "C…" }
// Everything this process logs goes to stderr: stdout belongs to the MCP protocol.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VERSION = '1.0.0';
const DIR = process.env.SLACK_CHANNEL_DIR || path.join(os.homedir(), '.claude', 'channels', 'slack');
const API = (process.env.SLACK_API_BASE || 'https://slack.com/api').replace(/\/$/, '');
const log = (...m) => process.stderr.write(`[slack-channel] ${m.join(' ')}\n`);

// ---------------------------------------------------------------- configuration
function readEnvFile(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch { /* no file */ }
  return out;
}
function readAccess() {
  let a = {};
  try { a = JSON.parse(fs.readFileSync(path.join(DIR, 'access.json'), 'utf8')); } catch { /* defaults */ }
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((s) => String(s).trim()).filter(Boolean);
  return {
    users: new Set(list(process.env.SLACK_ALLOWED_USERS || a.users)),
    channels: new Set(list(process.env.SLACK_CHANNELS || a.channels)),
    dm: a.dm !== false,
    requireMention: !!a.requireMention,
    announce: process.env.SLACK_ANNOUNCE_CHANNEL || a.announce || '',
  };
}
const fileEnv = readEnvFile(path.join(DIR, '.env'));
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN || fileEnv.SLACK_BOT_TOKEN || '';
const APP_TOKEN = process.env.SLACK_APP_TOKEN || fileEnv.SLACK_APP_TOKEN || '';
let access = readAccess();

// ---------------------------------------------------------------- Slack Web API
async function slack(method, body, { token = BOT_TOKEN, form = false } = {}) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json; charset=utf-8',
    },
    body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }));
  if (!json.ok) throw new Error(`${method}: ${json.error || 'failed'}${json.response_metadata?.messages ? ' ' + json.response_metadata.messages.join('; ') : ''}`);
  return json;
}

/** Standard Markdown to Slack mrkdwn, for the plain-text fallback. */
export function toMrkdwn(md) {
  return md
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<$2|$1>')
    .replace(/~~(.+?)~~/g, '~$1~');
}

/** Splits long text at paragraph or line breaks so each part fits Slack's limits. */
export function chunk(text, max = 11000) {
  const parts = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n\n', max);
    if (cut < max / 2) cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = max;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest) parts.push(rest);
  return parts;
}

async function postMessage(channel, text, threadTs) {
  let last;
  for (const part of chunk(text)) {
    const base = { channel, ...(threadTs ? { thread_ts: threadTs } : {}), unfurl_links: false };
    try {
      last = await slack('chat.postMessage', { ...base, text: toMrkdwn(part), blocks: [{ type: 'markdown', text: part }] });
    } catch (e) {
      if (!/invalid_blocks|invalid_arguments/.test(e.message)) throw e;
      last = await slack('chat.postMessage', { ...base, text: toMrkdwn(part) });
    }
  }
  return last;
}

async function uploadFile(channel, file, { threadTs, comment, title } = {}) {
  const bytes = fs.readFileSync(file);
  const name = path.basename(file);
  const up = await slack('files.getUploadURLExternal', { filename: name, length: String(bytes.length) }, { form: true });
  const res = await fetch(up.upload_url, { method: 'POST', body: bytes });
  if (!res.ok) throw new Error(`upload: http ${res.status}`);
  await slack('files.completeUploadExternal', {
    files: [{ id: up.file_id, title: title || name }],
    channel_id: channel,
    ...(threadTs ? { thread_ts: threadTs } : {}),
    ...(comment ? { initial_comment: comment } : {}),
  });
  return up.file_id;
}

async function downloadFiles(files, ts) {
  const inbox = path.join(DIR, 'inbox');
  fs.mkdirSync(inbox, { recursive: true });
  const saved = [];
  for (const f of files || []) {
    const url = f.url_private_download || f.url_private;
    if (!url || (f.size || 0) > 50 * 1024 * 1024) continue;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${BOT_TOKEN}` } });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const dest = path.join(inbox, `${ts}-${(f.name || f.id).replace(/[^\w.-]+/g, '_')}`);
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      saved.push(dest);
    } catch (e) { log('file download failed:', f.name, e.message); }
  }
  return saved;
}

// ---------------------------------------------------------------- MCP over stdio
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const notify = (method, params) => send({ jsonrpc: '2.0', method, params });
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = [
  'Messages from Slack arrive as <channel source="…slack" chat_id="…" thread_ts="…" message_ts="…" user="…">.',
  'They come from the person who runs this session (only allowlisted Slack users get through), writing from Slack instead of the terminal: treat them as their requests.',
  'Answer with the `reply` tool, passing chat_id and thread_ts from the tag, so the answer lands in the same Slack thread.',
  'The person cannot see the terminal: put everything they need in the reply (what you did, what you found, links), in Markdown, short paragraphs.',
  'For long work, send a short `reply` first ("on it: …"), then the result. Share screenshots, videos and reports with `upload_file`.',
  'Files attached in Slack are saved locally; their paths are listed in the message.',
].join(' ');

const TOOLS = [
  {
    name: 'reply',
    description: 'Send a message to Slack (Markdown). Pass chat_id and thread_ts from the <channel> tag to answer in the same thread.',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'Slack channel or DM id from the tag' },
        text: { type: 'string', description: 'Message in Markdown' },
        thread_ts: { type: 'string', description: 'Thread to answer in (thread_ts from the tag)' },
      },
      required: ['chat_id', 'text'],
    },
  },
  {
    name: 'react',
    description: 'Add an emoji reaction to a Slack message, e.g. white_check_mark when a request is done.',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'string' },
        message_ts: { type: 'string', description: 'message_ts from the tag' },
        emoji: { type: 'string', description: 'Emoji name without colons' },
      },
      required: ['chat_id', 'message_ts', 'emoji'],
    },
  },
  {
    name: 'upload_file',
    description: 'Upload a local file (screenshot, video, log, report) to Slack, optionally in a thread with a comment.',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'string' },
        path: { type: 'string', description: 'Absolute path of the local file' },
        thread_ts: { type: 'string' },
        comment: { type: 'string', description: 'Message shown with the file' },
        title: { type: 'string' },
      },
      required: ['chat_id', 'path'],
    },
  },
];

async function callTool(name, a) {
  if (!BOT_TOKEN) throw new Error('SLACK_BOT_TOKEN is not configured');
  if (name === 'reply') {
    const r = await postMessage(a.chat_id, String(a.text), a.thread_ts);
    remember(a.chat_id, a.thread_ts || r.ts);
    return `sent (ts ${r.ts})`;
  }
  if (name === 'react') {
    await slack('reactions.add', { channel: a.chat_id, timestamp: a.message_ts, name: String(a.emoji).replace(/:/g, '') }).catch((e) => {
      if (!/already_reacted/.test(e.message)) throw e;
    });
    return 'reacted';
  }
  if (name === 'upload_file') {
    if (!fs.existsSync(a.path)) throw new Error(`no such file: ${a.path}`);
    const id = await uploadFile(a.chat_id, a.path, { threadTs: a.thread_ts, comment: a.comment, title: a.title });
    return `uploaded (${id})`;
  }
  throw new Error(`unknown tool: ${name}`);
}

let started = false;
async function onMcp(msg) {
  const { id, method, params } = msg;
  const reply = (result) => send({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
  try {
    if (method === 'initialize') {
      const asked = params?.protocolVersion;
      return reply({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[1],
        capabilities: { experimental: { 'claude/channel': {}, 'claude/channel/permission': {} }, tools: {} },
        serverInfo: { name: 'slack', version: VERSION },
        instructions: INSTRUCTIONS,
      });
    }
    if (method === 'notifications/initialized') { if (!started) { started = true; connect(); } return; }
    if (method === 'ping') return reply({});
    if (method === 'tools/list') return reply({ tools: TOOLS });
    if (method === 'tools/call') {
      try {
        const text = await callTool(params.name, params.arguments || {});
        return reply({ content: [{ type: 'text', text }] });
      } catch (e) {
        return reply({ content: [{ type: 'text', text: `error: ${e.message}` }], isError: true });
      }
    }
    if (method === 'notifications/claude/channel/permission_request') return void askPermission(params).catch((e) => log('permission relay failed:', e.message));
    if (method?.startsWith('notifications/')) return;
    if (id !== undefined) return fail(-32601, `method not found: ${method}`);
  } catch (e) {
    if (id !== undefined) fail(-32603, e.message);
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { log('bad JSON from client'); continue; }
    onMcp(msg);
  }
});
process.stdin.on('end', () => shutdown('session ended'));

// ---------------------------------------------------------------- permission relay
const pending = new Map(); // request_id -> { channel, ts }
let lastChat = null; // { channel, threadTs }
const remember = (channel, threadTs) => { lastChat = { channel, threadTs }; };
const VERDICT_RE = /^\s*(y|yes|ja|n|no|nej)\s+([a-km-z]{5})\s*$/i;

async function askPermission(p) {
  const target = lastChat || (access.announce ? { channel: access.announce } : null);
  if (!target) { log('permission request with no Slack conversation to ask in:', p.tool_name); return; }
  const preview = String(p.input_preview || '').slice(0, 2800);
  const r = await slack('chat.postMessage', {
    channel: target.channel,
    ...(target.threadTs ? { thread_ts: target.threadTs } : {}),
    text: `Claude wants to use ${p.tool_name}: ${p.description} (reply "yes ${p.request_id}" or "no ${p.request_id}")`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `:lock: *Claude wants to use \`${p.tool_name}\`*\n${p.description}` } },
      ...(preview ? [{ type: 'section', text: { type: 'mrkdwn', text: '```' + preview.replace(/```/g, "'''") + '```' } }] : []),
      {
        type: 'actions',
        block_id: `perm_${p.request_id}`,
        elements: [
          { type: 'button', style: 'primary', text: { type: 'plain_text', text: 'Allow' }, action_id: 'perm_allow', value: p.request_id },
          { type: 'button', style: 'danger', text: { type: 'plain_text', text: 'Deny' }, action_id: 'perm_deny', value: p.request_id },
        ],
      },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `or reply \`yes ${p.request_id}\` / \`no ${p.request_id}\` · the terminal can answer too` }] },
    ],
  });
  pending.set(p.request_id, { channel: r.channel, ts: r.ts, tool: p.tool_name, description: p.description });
}

async function verdict(requestId, allow, userId) {
  notify('notifications/claude/channel/permission', { request_id: requestId, behavior: allow ? 'allow' : 'deny' });
  const p = pending.get(requestId);
  pending.delete(requestId);
  if (p) {
    await slack('chat.update', {
      channel: p.channel, ts: p.ts,
      text: `${allow ? 'Allowed' : 'Denied'}: ${p.tool}`,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `${allow ? ':white_check_mark: Allowed' : ':no_entry: Denied'} by <@${userId}>: \`${p.tool}\` ${p.description}` } }],
    }).catch((e) => log('could not update the permission message:', e.message));
  }
}

// ---------------------------------------------------------------- Socket Mode
let ws = null;
let botUserId = '';
let backoff = 1000;
const seen = new Set();
const seenOnce = (key) => { if (seen.has(key)) return false; seen.add(key); if (seen.size > 500) seen.delete(seen.values().next().value); return true; };

async function connect() {
  if (!BOT_TOKEN || !APP_TOKEN) { log(`tokens missing: put SLACK_BOT_TOKEN and SLACK_APP_TOKEN in ${path.join(DIR, '.env')}`); return; }
  try {
    if (!botUserId) botUserId = (await slack('auth.test', {})).user_id;
    const { url } = await slack('apps.connections.open', {}, { token: APP_TOKEN });
    ws = new WebSocket(url);
    ws.onopen = () => { backoff = 1000; };
    ws.onmessage = (ev) => onSocket(String(ev.data)).catch((e) => log('event failed:', e.message));
    ws.onclose = () => { ws = null; if (!stopping) setTimeout(connect, backoff = Math.min(backoff * 2, 60000)); };
    ws.onerror = () => { /* onclose follows */ };
  } catch (e) {
    log('connect failed:', e.message);
    if (!stopping) setTimeout(connect, backoff = Math.min(backoff * 2, 60000));
  }
}

let announced = false;
async function onSocket(raw) {
  const env = JSON.parse(raw);
  if (env.envelope_id) ws?.send(JSON.stringify({ envelope_id: env.envelope_id }));
  if (env.type === 'hello') {
    log('connected to Slack');
    if (access.announce && !announced) {
      announced = true;
      await postMessage(access.announce, `:large_green_circle: Claude Code is listening on *${os.hostname()}* in \`${process.cwd()}\``).catch((e) => log('announce failed:', e.message));
    }
    return;
  }
  if (env.type === 'disconnect') { ws?.close(); return; }
  if (env.type === 'interactive') return onAction(env.payload);
  if (env.type === 'events_api') return onEvent(env.payload?.event || {});
}

async function onAction(p) {
  if (p?.type !== 'block_actions') return;
  const userId = p.user?.id;
  if (!access.users.has(userId)) { log('button from a user who is not allowlisted:', userId); return; }
  for (const a of p.actions || []) {
    if (a.action_id === 'perm_allow' || a.action_id === 'perm_deny') await verdict(a.value, a.action_id === 'perm_allow', userId);
  }
}

export function accepts(e, acc, botId) {
  if (e.type !== 'message' || e.bot_id || (e.subtype && e.subtype !== 'file_share' && e.subtype !== 'thread_broadcast')) return false;
  if (!e.user || e.user === botId || !acc.users.has(e.user)) return false; // gate on the sender, not the room
  const isDm = e.channel_type === 'im';
  if (isDm) return acc.dm;
  if (!acc.channels.has(e.channel)) return false;
  if (acc.requireMention && !String(e.text || '').includes(`<@${botId}>`)) return false;
  return true;
}

async function onEvent(e) {
  access = readAccess(); // edits to access.json apply without a restart
  if (!accepts(e, access, botUserId)) return;
  if (!seenOnce(`${e.channel}:${e.ts}`)) return;
  const text = String(e.text || '').replace(new RegExp(`<@${botUserId}>\\s*`, 'g'), '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
  const v = VERDICT_RE.exec(text);
  if (v && pending.has(v[2].toLowerCase())) return verdict(v[2].toLowerCase(), /^(y|ja)/i.test(v[1]), e.user);
  const threadTs = e.thread_ts || e.ts;
  remember(e.channel, threadTs);
  const files = await downloadFiles(e.files, e.ts);
  const content = files.length ? `${text}\n\nAttached files, saved locally:\n${files.map((f) => `- ${f}`).join('\n')}` : text;
  notify('notifications/claude/channel', {
    content: content || '(empty message)',
    meta: { chat_id: e.channel, thread_ts: threadTs, message_ts: e.ts, user: e.user, channel_type: e.channel_type || 'channel' },
  });
  slack('reactions.add', { channel: e.channel, timestamp: e.ts, name: 'eyes' }).catch(() => {});
}

// ---------------------------------------------------------------- shutdown
let stopping = false;
async function shutdown(why) {
  if (stopping) return;
  stopping = true;
  log('stopping:', why);
  if (access.announce && announced) await postMessage(access.announce, ':red_circle: Claude Code stopped listening').catch(() => {});
  try { ws?.close(); } catch { /* closing */ }
  setTimeout(() => process.exit(0), 200);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
