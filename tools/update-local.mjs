#!/usr/bin/env node
// Bring this machine up to date with the marketplace after a push: refresh the marketplace, update every plugin from
// it that is installed here (user and project scope), and install the ones a repository enables in its
// .claude/settings.json but that were never installed on this machine — enabling alone does not load a plugin.
//
//   node tools/update-local.mjs                         # refresh + update what is installed
//   node tools/update-local.mjs --scan ~/src --scan D:/code   # also install what repositories under these folders enable
//   node tools/update-local.mjs --dry-run --scan ~/src  # only say what would be done
//
// Running sessions keep the plugins they started with: restart them afterwards. Exit 1 when anything failed.
// `claude plugin install --scope project` rewrites the repository's settings.json; when the file was clean before and
// its content is unchanged, the reformat is reverted so nothing shows up as a change in the repository.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKETPLACE = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8')).name;
const CONFIG = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const INSTALLED = path.join(CONFIG, 'plugins', 'installed_plugins.json');

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const scan = argv.flatMap((a, i) => (a === '--scan' && argv[i + 1] ? [argv[i + 1].replace(/^~(?=$|[/\\])/, os.homedir())] : []));
if (argv.includes('-h') || argv.includes('--help')) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 12).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}

function claude(args, cwd) {
  // On Windows `claude` is a .cmd shim, which needs a shell; the arguments are plugin ids and scopes, never user text.
  const opts = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 };
  const r = process.platform === 'win32'
    ? spawnSync(['claude', ...args, '--json'].join(' '), { ...opts, shell: true })
    : spawnSync('claude', [...args, '--json'], opts);
  const line = (r.stdout || '').trim().split('\n').reverse().find((l) => l.startsWith('{'));
  let json = null;
  try { json = line ? JSON.parse(line) : null; } catch { /* not json */ }
  return { ok: r.status === 0, json, text: (json?.message || r.stderr || r.stdout || '').trim().split('\n').pop() };
}

const git = (dir, ...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/** The main checkout a folder belongs to (a worktree uses its main repository's plugin installs), or the folder. */
function mainCheckout(dir) {
  const r = git(dir, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  if (r.status !== 0) return path.resolve(dir);
  const common = r.stdout.trim();
  return path.basename(common) === '.git' ? path.dirname(common) : path.resolve(dir);
}

const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function sortedJson(v) {
  if (Array.isArray(v)) return v.map(sortedJson);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortedJson(v[k])]));
  return v;
}

/** Runs fn in a repository and reverts a pure reformat of .claude/settings.json that it caused. */
function keepSettings(dir, fn) {
  const file = path.join(dir, '.claude', 'settings.json');
  const tracked = git(dir, 'ls-files', '--error-unmatch', '.claude/settings.json').status === 0;
  const clean = tracked && git(dir, 'status', '--porcelain', '--', '.claude/settings.json').stdout.trim() === '';
  const before = clean ? fs.readFileSync(file, 'utf8') : null;
  const result = fn();
  if (before !== null) {
    try {
      const after = fs.readFileSync(file, 'utf8');
      if (after !== before && JSON.stringify(sortedJson(JSON.parse(after))) === JSON.stringify(sortedJson(JSON.parse(before)))) fs.writeFileSync(file, before);
    } catch { /* leave it: the content changed or the file is unreadable */ }
  }
  return result;
}

const rows = [];
let failed = false;
const report = (plugin, where, outcome) => { rows.push([plugin, where, outcome]); };

// 1. Refresh the marketplace.
if (dryRun) report('marketplace', MARKETPLACE, 'would refresh');
else {
  const r = claude(['plugin', 'marketplace', 'update', MARKETPLACE], os.homedir());
  if (!r.ok) failed = true;
  report('marketplace', MARKETPLACE, r.ok ? 'refreshed' : `FAILED: ${r.text}`);
}

// 2. Update what is installed.
const readInstalled = () => { try { return JSON.parse(fs.readFileSync(INSTALLED, 'utf8')).plugins || {}; } catch { return {}; } };
const installed = readInstalled();
const have = []; // [plugin, scope, dir]
for (const [id, entries] of Object.entries(installed)) {
  if (!id.endsWith(`@${MARKETPLACE}`)) continue;
  for (const e of [].concat(entries)) {
    const dir = e.scope === 'user' ? os.homedir() : e.projectPath;
    const where = e.scope === 'user' ? 'user' : e.projectPath;
    if (!dir || !fs.existsSync(dir)) { report(id, where, 'skipped: the folder is gone (stale install record)'); continue; }
    have.push([id, e.scope, dir]);
    if (dryRun) { report(id, where, `would update from ${e.version}`); continue; }
    const r = keepSettings(dir, () => claude(['plugin', 'update', id, '--scope', e.scope], dir));
    if (!r.ok) failed = true;
    const j = r.json || {};
    report(id, where, !r.ok ? `FAILED: ${r.text}` : j.updateOutcome === 'up_to_date' ? `up to date (${j.newVersion || e.version})` : `${j.oldVersion || e.version} → ${j.newVersion || '?'}`);
  }
}

// 3. Install what scanned repositories enable but this machine never installed.
const repos = new Set();
for (const root of scan) {
  if (!fs.existsSync(root)) { report('scan', root, 'skipped: no such folder'); continue; }
  const dirs = [root, ...fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(root, d.name))];
  for (const d of dirs) if (fs.existsSync(path.join(d, '.claude', 'settings.json'))) repos.add(mainCheckout(d));
}
for (const dir of repos) {
  let enabled = {};
  try { enabled = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8')).enabledPlugins || {}; } catch { continue; }
  for (const [id, on] of Object.entries(enabled)) {
    if (!on || !id.endsWith(`@${MARKETPLACE}`)) continue;
    if (have.some(([p, scope, d]) => p === id && (scope === 'user' || same(d, dir)))) continue;
    if (dryRun) { report(id, dir, 'would install (enabled here, not installed on this machine)'); continue; }
    const r = keepSettings(dir, () => claude(['plugin', 'install', id, '--scope', 'project'], dir));
    if (!r.ok) failed = true;
    const version = [].concat(readInstalled()[id] || []).find((e) => e.projectPath && same(e.projectPath, dir))?.version;
    report(id, dir, r.ok ? `installed ${version || ''}`.trim() : `FAILED: ${r.text}`);
  }
}

const w = [0, 1].map((i) => Math.max(...rows.map((r) => r[i].length)));
for (const [a, b, c] of rows) console.log(`${a.padEnd(w[0])}  ${b.padEnd(w[1])}  ${c}`);
console.log(dryRun ? '\nDry run: nothing changed.' : `\n${failed ? 'Some steps failed (above).' : 'Done.'} Restart running Claude sessions to load the new versions.`);
process.exitCode = failed ? 1 : 0;
