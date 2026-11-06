#!/usr/bin/env node
// Run an issue's review key and say PASS or FAIL with evidence.
//
//   node keycheck.mjs run <n> [--key <file>] [--out <dir>] [--no-freeze]
//   node keycheck.mjs hash <n> [--key <file>]
//
// The key is `.review-keys/<n>.json` at the repository root (see ../SKILL.md for the format). `run`:
//   1. freeze: the key file and every `oracle` path are committed and unchanged since the commit that added the key;
//   2. checks: each command exits as expected (and its output matches, or its metric meets the threshold);
//   3. parity: every case gives the same output from `legacy` and `candidate` after the declared normalisation;
// then writes result.json and summary.md to out/review-key/<n>/ (or --out) and exits 0 on PASS, 1 on FAIL, 2 on misuse.
// No dependencies beyond Node 18+ and git.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [cmd, issue, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
const flag = (name) => rest.includes(name);
if (!['run', 'hash'].includes(cmd) || !/^\d+$/.test(issue || '')) {
  console.error('usage: keycheck.mjs run <n> [--key <file>] [--out <dir>] [--no-freeze] | hash <n> [--key <file>]');
  process.exit(2);
}

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });
const top = git('rev-parse', '--show-toplevel').stdout.trim();
if (!top) { console.error('not inside a git repository'); process.exit(2); }
const keyRel = `.review-keys/${issue}.json`;
const keyPath = path.resolve(opt('--key') || path.join(top, keyRel));
if (!fs.existsSync(keyPath)) { console.error(`no review key at ${keyPath}`); process.exit(2); }
let key;
try { key = JSON.parse(fs.readFileSync(keyPath, 'utf8')); } catch (e) { console.error(`${keyPath}: ${e.message}`); process.exit(2); }
const oracle = (key.oracle || []).map((p) => p.replace(/\\/g, '/'));

// ---------- hashing ----------
function hashPath(p) {
  const abs = path.resolve(top, p);
  if (!fs.existsSync(abs)) return 'missing';
  const h = createHash('sha256');
  const walk = (f) => {
    const st = fs.statSync(f);
    if (st.isDirectory()) for (const c of fs.readdirSync(f).sort()) walk(path.join(f, c));
    else {
      // Text files hash with LF line ends, so a checkout's autocrlf does not change the hash.
      let b = fs.readFileSync(f);
      if (!b.includes(0)) b = Buffer.from(b.toString('utf8').replace(/\r\n/g, '\n'));
      h.update(path.relative(abs, f).replace(/\\/g, '/')); h.update(b);
    }
  };
  walk(abs);
  return h.digest('hex');
}
const hashes = () => Object.fromEntries([[path.relative(top, keyPath).replace(/\\/g, '/'), hashPath(keyPath)], ...oracle.map((p) => [p, hashPath(p)])]);

if (cmd === 'hash') {
  for (const [p, h] of Object.entries(hashes())) console.log(`${h.slice(0, 16)}  ${p}`);
  process.exit(0);
}

// ---------- shell ----------
const shell = process.env.KEYCHECK_SHELL || (process.platform === 'win32'
  ? ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files (x86)/Git/bin/bash.exe'].find((s) => fs.existsSync(s)) || true
  : '/bin/sh');
const sh = (command, { cwd = top, timeoutSec = 600, input } = {}) => {
  const t = Date.now();
  const r = spawnSync(command, { cwd: path.resolve(top, cwd), shell, encoding: 'buffer', input, timeout: timeoutSec * 1000, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, KEYCHECK_ISSUE: issue } });
  return { code: r.status ?? (r.error ? -1 : null), signal: r.signal, stdout: r.stdout || Buffer.alloc(0), stderr: r.stderr || Buffer.alloc(0), ms: Date.now() - t, error: r.error?.message };
};
const tail = (buf, n = 15) => buf.toString('utf8').trimEnd().split(/\r?\n/).slice(-n).join('\n');

const result = { issue: Number(issue), kind: key.kind, claim: key.claim, head: git('rev-parse', 'HEAD').stdout.trim(), at: new Date().toISOString(), freeze: null, checks: [], parity: null, oracle: hashes(), verdict: 'PASS', reasons: [] };
const fail = (why) => { result.verdict = 'FAIL'; result.reasons.push(why); };

// ---------- 1. freeze ----------
if (!flag('--no-freeze') && !opt('--key')) {
  const added = git('log', '--diff-filter=A', '--format=%H', '--', keyRel).stdout.trim().split('\n').filter(Boolean);
  const keyCommit = added.at(-1);
  if (!keyCommit) fail(`the key is not committed: commit ${keyRel} (and its oracle) before the implementation`);
  else {
    const paths = [keyRel, ...oracle];
    const changed = git('diff', '--name-only', keyCommit, '--', ...paths).stdout.trim().split('\n').filter(Boolean);
    // New files inside an oracle folder count as a change too (without paths ls-files would list the whole tree).
    const untracked = oracle.length ? git('ls-files', '--others', '--exclude-standard', '--', ...oracle).stdout.trim().split('\n').filter(Boolean) : [];
    result.freeze = { keyCommit, changed: [...new Set([...changed, ...untracked])] };
    if (result.freeze.changed.length) fail(`the key or its oracle changed since ${keyCommit.slice(0, 8)}: ${result.freeze.changed.join(', ')}`);
    const missing = oracle.filter((p) => !fs.existsSync(path.resolve(top, p)));
    if (missing.length) fail(`oracle paths missing: ${missing.join(', ')}`);
  }
}

// ---------- 2. checks ----------
for (const c of key.checks || []) {
  const r = sh(c.run, c);
  const out = r.stdout.toString('utf8') + r.stderr.toString('utf8');
  const entry = { name: c.name || c.run, run: c.run, code: r.code, ms: r.ms, ok: true, detail: '' };
  const expectExit = c.expectExit ?? 0;
  if (r.error && r.code === null) { entry.ok = false; entry.detail = r.error; }
  else if (r.code !== expectExit) { entry.ok = false; entry.detail = `exit ${r.code}, expected ${expectExit}`; }
  if (entry.ok && c.expectOutput) {
    const m = out.match(new RegExp(c.expectOutput, 'm'));
    if (!m) { entry.ok = false; entry.detail = `output does not match /${c.expectOutput}/`; } else entry.detail = m[0].trim().slice(0, 160);
  }
  if (c.metric) {
    const m = out.match(new RegExp(c.metric, 'm'));
    const v = m ? Number(m[1]) : NaN;
    entry.metric = v;
    if (Number.isNaN(v)) { entry.ok = false; entry.detail = `no metric /${c.metric}/ in the output`; }
    else if (c.atLeast !== undefined && v < c.atLeast) { entry.ok = false; entry.detail = `${v} < ${c.atLeast}`; }
    else if (c.atMost !== undefined && v > c.atMost) { entry.ok = false; entry.detail = `${v} > ${c.atMost}`; }
    else entry.detail ||= `${v}${c.atLeast !== undefined ? ` >= ${c.atLeast}` : ''}${c.atMost !== undefined ? ` <= ${c.atMost}` : ''}`;
  }
  if (!entry.ok) entry.tail = tail(Buffer.from(out));
  else if (!entry.detail) { const last = out.trim().split(/\r?\n/).at(-1) || ''; entry.detail = last.slice(0, 160); }
  result.checks.push(entry);
  if (!entry.ok) fail(`check "${entry.name}": ${entry.detail}`);
}

// ---------- 3. parity ----------
function tokens(p) { // "$.a.b[*].c" -> ['a','b','*','c']
  return p.replace(/^\$\.?/, '').split(/\.|\[(\*|\d+)\]/).filter((t) => t !== undefined && t !== '');
}
function atPath(obj, toks, fn) {
  if (obj === null || typeof obj !== 'object') return;
  const [t, ...more] = toks;
  const keys = t === '*' ? Object.keys(obj) : [t];
  for (const k of keys) {
    if (!(k in obj)) continue;
    if (more.length === 0) fn(obj, k); else atPath(obj[k], more, fn);
  }
}
const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
function normalise(text, n = {}, mode) {
  for (const [re, by] of n.replace || []) text = text.replace(new RegExp(re, 'g'), by);
  if (mode !== 'json') return n.trim === false ? text : text.replace(/\r\n/g, '\n').trimEnd();
  let v;
  try { v = JSON.parse(text); } catch { return { invalidJson: text.slice(0, 500) }; }
  const root = { $: v };
  for (const p of n.ignore || []) atPath(root, ['$', ...tokens(p)], (o, k) => { if (Array.isArray(o)) o[k] = '<ignored>'; else delete o[k]; });
  for (const p of n.sortArrays || []) atPath(root, ['$', ...tokens(p)], (o, k) => { if (Array.isArray(o[k])) o[k].sort((a, b) => (stable(a) < stable(b) ? -1 : 1)); });
  return root.$;
}
function jsonDiff(a, b, at = '$', out = []) {
  if (out.length >= 8) return out;
  if (stable(a) === stable(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of keys) jsonDiff(a[k], b[k], Array.isArray(a) ? `${at}[${k}]` : `${at}.${k}`, out);
    return out;
  }
  out.push({ at, legacy: JSON.stringify(a)?.slice(0, 200), candidate: JSON.stringify(b)?.slice(0, 200) });
  return out;
}
function textDiff(a, b) {
  const la = a.split('\n'), lb = b.split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) return [{ at: `line ${i + 1}`, legacy: (la[i] ?? '<end>').slice(0, 200), candidate: (lb[i] ?? '<end>').slice(0, 200) }];
  return [];
}
async function produce(target, c, side) {
  if (target === 'recorded') {
    if (c.expected === undefined) throw new Error('legacy is "recorded" but the case has no "expected"');
    return { status: c.expectedStatus, body: Buffer.from(typeof c.expected === 'string' ? c.expected : JSON.stringify(c.expected)) };
  }
  if (target.url) {
    const req = c.request || {};
    const res = await fetch(new URL(req.path || '/', target.url), { method: req.method || 'GET', headers: { ...(target.headers || {}), ...(req.headers || {}) }, body: req.body === undefined ? undefined : typeof req.body === 'string' ? req.body : JSON.stringify(req.body) });
    return { status: res.status, body: Buffer.from(await res.arrayBuffer()) };
  }
  if (target.run) {
    const outFile = path.join(outDir, 'parity', side, `${c.id}.out`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const command = target.run.replaceAll('{args}', c.args ?? '').replaceAll('{input}', c.input ?? '').replaceAll('{out}', outFile.replace(/\\/g, '/')).replaceAll('{id}', String(c.id));
    const r = sh(command, { cwd: target.cwd, timeoutSec: target.timeoutSec || 120, input: c.stdin });
    if (r.code !== 0) throw new Error(`${side} exited ${r.code}: ${tail(r.stderr, 3)}`);
    return { status: 0, body: target.run.includes('{out}') ? fs.readFileSync(outFile) : r.stdout };
  }
  throw new Error(`${side}: a target is "recorded", {url} or {run}`);
}

const outDir = path.resolve(top, opt('--out') || path.join('out', 'review-key', issue));
fs.mkdirSync(outDir, { recursive: true });

if (key.parity) {
  const p = key.parity;
  const mode = p.compare || 'json';
  let cases = p.cases;
  if (typeof cases === 'string') {
    const raw = fs.readFileSync(path.resolve(top, cases), 'utf8');
    cases = cases.endsWith('.jsonl') ? raw.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l)) : JSON.parse(raw);
  }
  cases = (cases || []).map((c, i) => ({ id: c.id ?? i + 1, ...c }));
  const par = { compare: mode, cases: cases.length, identical: 0, different: 0, errors: 0, diffs: [] };
  for (const c of cases) {
    try {
      const [a, b] = [await produce(p.legacy, c, 'legacy'), await produce(p.candidate, c, 'candidate')];
      let same, diff = [];
      if (mode === 'bytes') {
        const [ha, hb] = [a.body, b.body].map((x) => createHash('sha256').update(x).digest('hex'));
        same = ha === hb; if (!same) diff = [{ at: 'sha256', legacy: ha, candidate: hb }];
      } else {
        const na = normalise(a.body.toString('utf8'), p.normalize, mode), nb = normalise(b.body.toString('utf8'), p.normalize, mode);
        same = mode === 'json' ? stable(na) === stable(nb) : na === nb;
        if (!same) diff = mode === 'json' ? jsonDiff(na, nb) : textDiff(na, nb);
      }
      if (p.compareStatus !== false && a.status !== undefined && b.status !== undefined && a.status !== b.status) { same = false; diff.unshift({ at: 'status', legacy: a.status, candidate: b.status }); }
      if (same) par.identical++; else { par.different++; if (par.diffs.length < 10) par.diffs.push({ id: c.id, diff }); }
    } catch (e) {
      par.errors++; if (par.diffs.length < 10) par.diffs.push({ id: c.id, error: e.message });
    }
  }
  result.parity = par;
  const min = p.min ?? 1;
  if (cases.length < min) fail(`parity: ${cases.length} cases, the key asks for at least ${min}`);
  if (par.different || par.errors) fail(`parity: ${par.different} different and ${par.errors} failed of ${cases.length}`);
}

if (!(key.checks || []).length && !key.parity) fail('the key has neither checks nor parity: nothing decides it');

// ---------- report ----------
const lines = [`Review key #${issue} (${key.kind || 'spec'}): **${result.verdict}**`, '', `> ${key.claim || ''}`, ''];
if (result.freeze) lines.push(`- Frozen since \`${result.freeze.keyCommit.slice(0, 8)}\`: ${result.freeze.changed.length ? 'NO, changed ' + result.freeze.changed.join(', ') : 'yes'}`);
for (const c of result.checks) lines.push(`- ${c.ok ? 'PASS' : 'FAIL'} ${c.name} (${(c.ms / 1000).toFixed(1)} s)${c.detail ? `: ${c.detail}` : ''}`);
if (result.parity) {
  const p = result.parity;
  lines.push(`- Parity (${p.compare}): ${p.identical}/${p.cases} identical, ${p.different} different, ${p.errors} errors`);
  for (const d of p.diffs.slice(0, 5)) lines.push(d.error ? `  - case ${d.id}: ${d.error}` : `  - case ${d.id}: ${d.diff.map((x) => `${x.at} ${x.legacy} -> ${x.candidate}`).join('; ')}`);
}
lines.push(`- HEAD \`${result.head.slice(0, 8)}\`, oracle ${Object.entries(result.oracle).map(([p, h]) => `\`${p}\` ${h.slice(0, 12)}`).join(', ')}`);
if (result.reasons.length) lines.push('', ...result.reasons.map((r) => `Why: ${r}`));
fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
fs.writeFileSync(path.join(outDir, 'summary.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
for (const c of result.checks.filter((x) => !x.ok && x.tail)) console.log(`\n--- ${c.name} (last lines)\n${c.tail}`);
console.log(`\nevidence: ${path.relative(top, outDir).replace(/\\/g, '/')}/result.json`);
process.exit(result.verdict === 'PASS' ? 0 : 1);
