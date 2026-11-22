#!/usr/bin/env node
// PreToolUse hook for Bash and PowerShell: the delivery rules that must never be broken, enforced instead of asked for.
//
//   1. Stage explicit paths: no `git add -A|--all|.`, no `git commit -a`.
//   2. Fetch before you push: `git push` is refused when the repository has not been fetched in the last
//      GUARDRAILS_FETCH_MINUTES (default 15) — other sessions push to the same repositories.
//      `git fetch … && git push` in one command passes. Force pushes to main/master are refused.
//   3. A committed review key is frozen: a commit that changes `.review-keys/<n>.json` or one of its oracle paths, once
//      that key is in HEAD, is refused unless the command carries REVIEW_KEY_CHANGE=<n> (a human answered on the issue).
//      A file in the oracle of several keys needs all of them: REVIEW_KEY_CHANGE=<n>,<m>.
//   4. A pull request in a repository with a delivery profile carries a `3 am:` line in its body.
//   5. The work is written in English: a commit message, PR or issue text (title, body, comment) that reads as Swedish is
//      refused, whatever language the request was in. Text in quotes or code spans is product content and not judged.
//      GUARDRAILS_LANGUAGE=any (in the environment Claude Code runs in) turns this off.
//
// Input: the hook JSON on stdin. Output: nothing (no decision) or a deny decision as JSON. Fails open: any error in
// this script lets the command through, so a broken guard never blocks work.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FETCH_MINUTES = Number(process.env.GUARDRAILS_FETCH_MINUTES || 15);
const LANGUAGE = String(process.env.GUARDRAILS_LANGUAGE || 'en').toLowerCase();

// Swedish function words that do not double as English words, for telling a Swedish text from an English one.
const SV_WORDS = new Set(('och att inte är för på från också när eller utan bara varför måste finns blir eftersom detta denna '
  + 'dessa här där vad hur ska jag har kan med som det efter ett vi får gör görs nya inga inget ingen alla vill kommer').split(' '));

/** True when a text reads as Swedish. Quoted text, code spans, paths and ids are left out: they are content, not prose. */
export function swedish(text) {
  const plain = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/"[^"\n]*"|“[^”\n]*”|«[^»\n]*»/g, ' ')
    .replace(/(^|\s)'[^'\n]*'(?=[\s.,;:!?)]|$)/g, ' ')
    .replace(/\S*(?:[/\\_@#]|\.\w)\S*/g, ' ');
  const words = plain.toLowerCase().match(/[a-zåäöéü]+/g) || [];
  if (words.length < 4) return false;
  const distinct = new Set(words);
  const marked = [...distinct].filter((w) => SV_WORDS.has(w) || /[åäö]/.test(w));
  return marked.length >= 3 && marked.length / distinct.size >= 0.15;
}

const ENGLISH = 'write commit messages, pull requests and issues in English, whatever language the request was in: English is '
  + 'the working language here. Swedish product text (a UI string, a test phrase) goes in quotes or a code span.';

/** The text arguments of a command: values of `flags`, and the contents of the files named by `fileFlags`. */
function textArgs(args, cwd, flags, fileFlags, docs = []) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const eq = a.match(/^(--[a-z-]+)=([\s\S]*)$/);
    const flag = eq ? eq[1] : a;
    const value = eq ? eq[2] : args[i + 1];
    const cluster = /^-[a-zA-Z]*m$/.test(a) && a.length > 2 && flags.includes('-m'); // git commit -qm "…"
    if (flags.includes(flag) || cluster) { if (value === '') out.push(...docs); else if (value != null) out.push(value); if (!eq) i++; }
    else if (fileFlags.includes(flag)) {
      if (value === '-') out.push(...docs);
      else if (value) { try { out.push(fs.readFileSync(path.resolve(cwd, value), 'utf8')); } catch { /* not readable: not judged */ } }
      if (!eq) i++;
    } else if (/^-m./.test(a) && flags.includes('-m')) out.push(a.slice(2));
  }
  return out;
}

function deny(reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `guardrails: ${reason}` } }));
  process.exit(0);
}

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();

/**
 * Splits a shell command line into simple commands, each as a list of words: on && || ; | and newlines outside
 * quotes, so a multi-line quoted message stays one word.
 */
export function commands(line) {
  // Heredoc bodies and PowerShell here-strings are data (commit messages, PR bodies), never commands.
  line = line
    .replace(/<<-?\s*(['"]?)([A-Za-z_][\w]*)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, ' $3')
    .replace(/@'\r?\n[\s\S]*?\r?\n'@/g, "''")
    .replace(/@"\r?\n[\s\S]*?\r?\n"@/g, "''");
  const out = [];
  let words = [];
  let word = null;
  let quote = null;
  const endWord = () => { if (word !== null) { words.push(word); word = null; } };
  const endCommand = () => { endWord(); if (words.length) out.push(words); words = []; };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < line.length) word += line[++i];
      else word += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; word ??= ''; continue; }
    if (c === '\n' || c === '\r' || c === ';') { endCommand(); continue; }
    if ((c === '&' || c === '|') && line[i + 1] === c) { endCommand(); i++; continue; }
    if (c === '|') { endCommand(); continue; }
    if (/\s/.test(c)) { endWord(); continue; }
    word = (word ?? '') + c;
  }
  endCommand();
  return out;
}

/** The git invocation in a word list, if any: { dir, sub, args, env } — handles `git -C dir`, env prefixes and `cd`. */
function gitCall(words, cwd) {
  let i = 0;
  const env = {};
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) { const [k, ...v] = words[i].split('='); env[k] = v.join('='); i++; }
  if (words[i] === '&' || words[i] === 'command') i++;
  if (!/^(git|git\.exe)$/i.test(path.basename(words[i] || '').replace(/["']/g, ''))) return null;
  i++;
  let dir = cwd;
  while (i < words.length && words[i].startsWith('-')) {
    if (words[i] === '-C') { dir = path.resolve(dir, words[i + 1] || '.'); i += 2; } else if (/^-c$/.test(words[i])) i += 2; else i++;
  }
  return { dir, sub: words[i], args: words.slice(i + 1), env };
}

export function check(input) {
  const cmd = String(input.tool_input?.command || '');
  if (!/\bgit\b|\bgh\b/.test(cmd)) return null;
  let cwd = input.cwd || process.cwd();
  const list = commands(cmd);
  // Heredoc and here-string bodies: the message of `git commit -F -`, `gh … --body-file -` or `-m @'…'@`.
  const docs = [...cmd.matchAll(/<<-?\s*(['"]?)([A-Za-z_][\w]*)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g)].map((m) => m[3])
    .concat([...cmd.matchAll(/@(['"])\r?\n([\s\S]*?)\r?\n\1@/g)].map((m) => m[2]));
  const english = (texts) => LANGUAGE !== 'en' || !texts.some(swedish);
  let fetched = false;
  for (const words of list) {
    if (words[0] === 'cd' || /^(Set-Location|sl|pushd)$/i.test(words[0])) { if (words[1]) cwd = path.resolve(cwd, words[1]); continue; }

    if (/^gh(\.exe)?$/i.test(words[0]) && /^(pr|issue)$/.test(words[1]) && /^(create|edit|comment|review)$/.test(words[2])) {
      if (!english(textArgs(words.slice(3), cwd, ['--title', '-t', '--body', '-b'], ['--body-file', '-F'], docs))) return ENGLISH;
      if (words[1] === 'pr' && words[2] === 'create') {
        const r = prBody(words, cwd);
        if (r) return r;
      }
      continue;
    }

    const g = gitCall(words, cwd);
    if (!g) continue;
    if (g.sub === 'fetch' || g.sub === 'pull') { fetched = true; continue; }

    if (g.sub === 'add' && g.args.some((a) => a === '-A' || a === '--all' || a === '.' || a === ':/')) {
      return 'stage explicit paths (`git add <path> …`), never `git add -A`/`--all`/`.`: other sessions may have changes in this checkout.';
    }
    if (g.sub === 'commit' && g.args.some((a) => /^-[a-zA-Z]*a[a-zA-Z]*$/.test(a) && !a.startsWith('--') || a === '--all')) {
      return 'no `git commit -a`: stage explicit paths first, then commit.';
    }
    if (g.sub === 'push' && !g.args.includes('--dry-run') && !g.args.includes('-n')) {
      const force = g.args.some((a) => a === '--force' || a === '-f' || /^\+/.test(a));
      if (force && g.args.some((a) => /^(\+?)(main|master)$|:(main|master)$/.test(a))) return 'no force push to main/master.';
      if (!fetched && !fetchedRecently(g.dir)) {
        return `fetch before you push: \`git fetch\` and reconcile with the remote first (nothing fetched in the last ${FETCH_MINUTES} minutes). Other sessions push to the same repository. \`git fetch && git push\` in one command is fine.`;
      }
    }
    if (g.sub === 'commit') {
      if (!english(textArgs(g.args, cwd, ['-m', '--message'], ['-F', '--file'], docs))) return ENGLISH;
      const r = frozenKey(g.dir, { ...g.env, ...envPrefix(cmd) });
      if (r) return r;
    }
  }
  return null;
}

function envPrefix(cmd) {
  const env = {};
  const list = String.raw`(\d+(?:\s*,\s*\d+)*)`;
  for (const m of cmd.matchAll(new RegExp(String.raw`\bREVIEW_KEY_CHANGE=['"]?` + list, 'g'))) env.REVIEW_KEY_CHANGE = m[1];
  for (const m of cmd.matchAll(new RegExp(String.raw`\$env:REVIEW_KEY_CHANGE\s*=\s*['"]?` + list, 'gi'))) env.REVIEW_KEY_CHANGE = m[1];
  return env;
}

function gitDir(dir) {
  try { return path.resolve(dir, git(dir, 'rev-parse', '--git-common-dir')); } catch { return null; }
}

function fetchedRecently(dir) {
  const gd = gitDir(dir);
  if (!gd) return true; // not a repository we can judge: let git decide
  try {
    const st = fs.statSync(path.join(gd, 'FETCH_HEAD'));
    return Date.now() - st.mtimeMs < FETCH_MINUTES * 60 * 1000;
  } catch { return false; }
}

function frozenKey(dir, env) {
  let staged;
  try { staged = git(dir, 'diff', '--cached', '--name-status', '--no-renames'); } catch { return null; }
  if (!staged) return null;
  const changed = staged.split('\n').map((l) => l.split('\t')).filter(([s]) => s && s !== 'A').map(([, p]) => p.replace(/\\/g, '/'));
  if (!changed.length) return null;
  let keys;
  try { keys = git(dir, 'ls-tree', '--name-only', 'HEAD', '.review-keys/').split('\n').filter((f) => /\.review-keys\/\d+\.json$/.test(f)); } catch { return null; }
  const allowed = new Set(String(env.REVIEW_KEY_CHANGE || '').split(',').map((s) => s.trim()).filter(Boolean));
  const hits = [];
  for (const keyFile of keys) {
    const n = keyFile.match(/(\d+)\.json$/)[1];
    let oracle = [];
    try { oracle = (JSON.parse(git(dir, 'show', `HEAD:${keyFile}`)).oracle || []).map((p) => p.replace(/\\/g, '/').replace(/\/$/, '')); } catch { /* unreadable key: guard the key file itself */ }
    const hit = changed.filter((p) => p === keyFile || oracle.some((o) => p === o || p.startsWith(`${o}/`)));
    if (hit.length) hits.push({ n, hit });
  }
  const refused = hits.find(({ n }) => !allowed.has(n));
  if (!refused) return null;
  // every key that lists one of the refused files must be named, so the advice names them all
  const needed = hits.filter(({ hit }) => hit.some((p) => refused.hit.includes(p))).map(({ n }) => n);
  const nums = needed.map((n) => `#${n}`).join(' and ');
  const subject = needed.length > 1 ? `review keys for ${nums} are` : `review key for ${nums} is`;
  return `the ${subject} frozen (${refused.hit.join(', ')}). The implementer never changes it; a wrong key is a human decision on the issue. After the answer, commit the change alone as "Review key for ${nums}: <what changed>" with REVIEW_KEY_CHANGE=${needed.join(',')} in front of the git command.`;
}

function prBody(words, cwd) {
  let dir = cwd;
  const ri = words.indexOf('--repo');
  if (ri >= 0) return null; // another repository: its profile is not here
  if (!fs.existsSync(path.join(dir, '.claude', 'profiles', 'delivery.md'))) {
    try { dir = git(cwd, 'rev-parse', '--show-toplevel'); } catch { return null; }
    if (!fs.existsSync(path.join(dir, '.claude', 'profiles', 'delivery.md'))) return null;
  }
  let body = null;
  for (let i = 0; i < words.length; i++) {
    if (words[i] === '--body-file' || words[i] === '-F') { try { body = fs.readFileSync(path.resolve(cwd, words[i + 1]), 'utf8'); } catch { return null; } }
    if (words[i] === '--body' || words[i] === '-b') body = words[i + 1] || '';
  }
  if (body === null) return 'a pull request here needs a body with a `3 am:` line (the delivery profile asks for it): write it to a file and pass `--body-file`.';
  if (!/3\s?am:/i.test(body)) return 'the pull request body has no `3 am:` line: name the signal that would show this change broken in production, or `3 am: n/a (<why>)` for docs, copy and pure refactors.';
  return null;
}

// ---------------------------------------------------------------- main
if (path.basename(process.argv[1] || '') === 'guard.mjs') {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (raw += d));
  process.stdin.on('end', () => {
    try {
      const reason = check(JSON.parse(raw || '{}'));
      if (reason) deny(reason);
    } catch (e) {
      process.stderr.write(`guardrails: ${e.message}\n`); // fail open
    }
    process.exit(0);
  });
}
