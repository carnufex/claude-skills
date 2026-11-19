// Tests for scripts/guard.mjs, run as the hook runs: JSON on stdin, decision on stdout. node --test tests/
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const GUARD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'guard.mjs');

function hook(command, cwd, env = {}) {
  const r = spawnSync(process.execPath, [GUARD], { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd }), encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(r.status, 0, r.stderr);
  if (!r.stdout.trim()) return null;
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.permissionDecision, 'deny');
  return out.permissionDecisionReason;
}

const g = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function repo({ profile = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  g(dir, 'init', '-q', '-b', 'main');
  g(dir, 'config', 'user.email', 't@t'); g(dir, 'config', 'user.name', 't'); g(dir, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  if (profile) { fs.mkdirSync(path.join(dir, '.claude', 'profiles'), { recursive: true }); fs.writeFileSync(path.join(dir, '.claude', 'profiles', 'delivery.md'), '# profile\n'); }
  g(dir, 'add', '.'); g(dir, 'commit', '-qm', 'init');
  return dir;
}

test('explicit staging', () => {
  const d = repo();
  assert.match(hook('git add -A', d), /explicit paths/);
  assert.match(hook('git add .', d), /explicit paths/);
  assert.match(hook('cd sub && git add --all', d), /explicit paths/);
  assert.match(hook('git commit -am "x"', d), /git commit -a/);
  assert.equal(hook('git add src/a.ts docs/b.md', d), null);
  assert.equal(hook('git commit -m "add a file"', d), null);
  assert.equal(hook('git commit --amend --no-edit', d), null);
  assert.equal(hook('npm test', d), null);
});

test('fetch before push', () => {
  const d = repo();
  const fh = path.join(d, '.git', 'FETCH_HEAD');
  assert.match(hook('git push', d), /fetch before you push/);
  assert.equal(hook('git fetch origin && git push -u origin main', d), null);
  assert.equal(hook('git push --dry-run', d), null);
  fs.writeFileSync(fh, '');
  assert.equal(hook('git push', d), null, 'fresh FETCH_HEAD passes');
  const old = (Date.now() - 60 * 60 * 1000) / 1000; fs.utimesSync(fh, old, old);
  assert.match(hook('git -C . push', d), /fetch before you push/, 'an hour-old fetch is stale');
  assert.equal(hook('git push', d, { GUARDRAILS_FETCH_MINUTES: '120' }), null, 'window is configurable');
  fs.writeFileSync(fh, '');
  assert.match(hook('git push --force origin main', d), /force push to main/);
  assert.equal(hook('git push --force-with-lease origin 12-feature', d), null);
});

test('a committed review key is frozen', () => {
  const d = repo();
  fs.mkdirSync(path.join(d, '.review-keys')); fs.mkdirSync(path.join(d, 'e2e'));
  fs.writeFileSync(path.join(d, '.review-keys', '7.json'), JSON.stringify({ kind: 'spec', oracle: ['e2e/key-7.spec.ts', 'corpus'], checks: [{ run: 'true' }] }));
  fs.writeFileSync(path.join(d, 'e2e', 'key-7.spec.ts'), 'test\n');
  // adding the key for the first time is the key commit: allowed
  g(d, 'add', '.review-keys/7.json', 'e2e/key-7.spec.ts');
  assert.equal(hook('git commit -m "Review key for #7"', d), null);
  g(d, 'commit', '-qm', 'Review key for #7');
  // implementation commits pass
  fs.writeFileSync(path.join(d, 'a.txt'), 'impl\n'); g(d, 'add', 'a.txt');
  assert.equal(hook('git commit -m "impl (#7)"', d), null);
  g(d, 'commit', '-qm', 'impl');
  // changing the oracle is refused, unless a human-approved key change says so
  fs.writeFileSync(path.join(d, 'e2e', 'key-7.spec.ts'), 'weaker\n'); g(d, 'add', 'e2e/key-7.spec.ts');
  assert.match(hook('git commit -m "tweak"', d), /review key for #7 is frozen.*e2e\/key-7\.spec\.ts/);
  assert.equal(hook('REVIEW_KEY_CHANGE=7 git commit -m "Review key for #7: one case was wrong"', d), null);
  assert.equal(hook('$env:REVIEW_KEY_CHANGE=7; git commit -m "Review key for #7: x"', d), null);
  assert.match(hook('REVIEW_KEY_CHANGE=8 git commit -m "x"', d), /frozen/, 'another number does not unlock it');
  g(d, 'reset', '-q');
  // a new file inside an oracle folder is a change too
  fs.mkdirSync(path.join(d, 'corpus')); fs.writeFileSync(path.join(d, 'corpus', 'c1.json'), '{}'); g(d, 'add', 'corpus/c1.json');
  g(d, 'commit', '-qm', 'corpus'); // committed before the hook saw it: now part of HEAD
  fs.writeFileSync(path.join(d, 'corpus', 'c1.json'), '{"x":1}'); g(d, 'add', 'corpus/c1.json');
  assert.match(hook('git commit -m "x"', d), /frozen.*corpus\/c1\.json/);
  g(d, 'reset', '-q');
  // the key file itself
  fs.writeFileSync(path.join(d, '.review-keys', '7.json'), '{}'); g(d, 'add', '.review-keys/7.json');
  assert.match(hook('git commit -m "x"', d), /frozen.*\.review-keys\/7\.json/);
});

test('a 3 am line in pull requests where the delivery profile is used', () => {
  const d = repo({ profile: true });
  const plain = repo();
  fs.writeFileSync(path.join(d, 'pr.md'), 'What and why\n\n3 am: the e2e check in CI\n');
  fs.writeFileSync(path.join(d, 'bad.md'), 'What and why\n');
  assert.equal(hook('gh pr create --title t --body-file pr.md', d), null);
  assert.match(hook('gh pr create --title t --body-file bad.md', d), /no `3 am:` line/);
  assert.match(hook('gh pr create --fill', d), /needs a body/);
  assert.equal(hook('gh pr create --title t --body "x\n3 am: n/a (docs)"', d), null);
  assert.equal(hook('gh pr create --fill', plain), null, 'no profile, no rule');
  assert.equal(hook('gh pr create --repo other/repo --fill', d), null, 'another repository is not judged by this profile');
});

test('heredoc and here-string bodies are data, not commands', () => {
  const d = repo();
  fs.writeFileSync(path.join(d, '.git', 'FETCH_HEAD'), '');
  const bash = "git add src/x.ts && git commit -q -F - <<'EOF'\nNever git add -A here.\ngit push --force origin main\nEOF\ngit status";
  assert.equal(hook(bash, d), null);
  const ps = "git commit -m @'\nWhy we never git add -A\n'@";
  assert.equal(hook(ps, d), null);
  assert.match(hook("cat <<EOF > note.txt\nhello\nEOF\ngit add -A", d), /explicit paths/, 'a command after the heredoc is still seen');
});

test('the work is written in English', () => {
  const d = repo();
  fs.writeFileSync(path.join(d, '.git', 'FETCH_HEAD'), '');
  // Swedish messages, titles and bodies are refused
  assert.match(hook('git commit -m "tap_stream: ett fel säger vad låtsasklienten gör (#132)"', d), /in English/);
  assert.match(hook('git commit -qm "Fixa så att kartan inte flimrar när man byter våning"', d), /in English/);
  assert.match(hook("git commit -q -F - <<'EOF'\nRättar felet som gör att listan inte uppdateras.\n\nDet här är en enkel ändring.\nEOF", d), /in English/);
  assert.match(hook("git commit -m @'\nVi har lagt till en ny vy för alla möten.\n'@", d), /in English/);
  assert.match(hook('gh issue create --title "Rösten är för långsam när man pratar" --body "x"', d), /in English/);
  fs.writeFileSync(path.join(d, 'sv.md'), 'Det här är en beskrivning av vad som har ändrats och varför vi gör det.\n\n3 am: loggen\n');
  assert.match(hook('gh pr create --title t --body-file sv.md', d), /in English/);
  assert.match(hook('gh pr comment 12 --body "Jag har fixat det nu, kan du titta igen?"', d), /in English/);
  // English passes, also with Swedish names, quoted product text and code spans
  assert.equal(hook('git commit -m "Fix the build of Sista natten på Holmnäs"', d), null);
  assert.equal(hook('git commit -m "Voice: add the phrase \'Hej! Jag är här, vad vill du veta?\' to the corpus"', d), null);
  assert.equal(hook('git commit -m "Translate the toolbar: `Sök`, `Spara`, `Avbryt`, `Öppna`"', d), null);
  assert.equal(hook("git commit -q -F - <<'EOF'\nKeep the map steady when the floor changes.\nEOF", d), null);
  assert.equal(hook('gh issue create --title "Voice answers are slow" --body "Time to first audio is 3.9 s at p50."', d), null);
  // a heredoc that is not the message is not judged
  assert.equal(hook("cat <<EOF > sv.txt\nDet här är svensk text för användaren och den ska vara kvar.\nEOF\ngit commit -m \"Add the Swedish help text\"", d), null);
  // switched off
  assert.equal(hook('git commit -m "Fixa så att kartan inte flimrar när man byter våning"', d, { GUARDRAILS_LANGUAGE: 'any' }), null);
});

test('fails open', () => {
  const r = spawnSync(process.execPath, [GUARD], { input: 'not json', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.equal(hook('git add -A', path.join(os.tmpdir(), 'no-such-dir-guard')), 'guardrails: stage explicit paths (`git add <path> …`), never `git add -A`/`--all`/`.`: other sessions may have changes in this checkout.');
});
