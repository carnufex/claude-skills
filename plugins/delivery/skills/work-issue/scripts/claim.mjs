#!/usr/bin/env node
/**
 * Issue claims, so two people (or two Claude sessions) never work on the same thing.
 * Part of the delivery plugin (work-issue skill). Needs the GitHub CLI (`gh`), logged in; run it
 * from inside the repository's checkout.
 *
 *   node claim.mjs list [--milestone <n|title>]               open issues, claimed or free, by milestone
 *   node claim.mjs claim <issue...> [--as <who>] [--branch <b>] [--force]
 *   node claim.mjs claim --milestone <n|title> [--as <who>]   claim every free open issue in a milestone
 *   node claim.mjs unclaim <issue...> [--milestone <n|title>]
 *
 * Every command takes --label <name> (default: $CLAIM_LABEL, else `status:in-progress`); the label is
 * created if the repository lacks it.
 *
 * A claim = the label + you as assignee + a claim comment saying who and which branch. Every Claude
 * session runs as the same GitHub user, so the comment, not the assignee, says which one. Two claims
 * at the same moment: the oldest comment wins and the other side deletes its own and backs out.
 */
import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';

let LABEL = process.env.CLAIM_LABEL || 'status:in-progress';
const CLAIM = /<!-- claim:v1 (\{.*?\}) -->/;
const RELEASE = '<!-- release:v1 -->';

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
}
function ghJson(args) {
  return JSON.parse(gh(args));
}
function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function parseArgs(argv) {
  const opts = { issues: [], as: '', branch: '', milestone: '', force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--as') opts.as = argv[++i] ?? '';
    else if (a === '--branch') opts.branch = argv[++i] ?? '';
    else if (a === '--milestone' || a === '-m') opts.milestone = argv[++i] ?? '';
    else if (a === '--force') opts.force = true;
    else if (a === '--label') LABEL = argv[++i] || LABEL;
    else if (/^#?\d+$/.test(a)) opts.issues.push(Number(a.replace('#', '')));
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

const repo = ghJson(['repo', 'view', '--json', 'nameWithOwner']).nameWithOwner;
const me = gh(['api', 'user', '--jq', '.login']).trim();

function comments(n) {
  return ghJson(['api', '--paginate', '--slurp', `repos/${repo}/issues/${n}/comments`]).flat();
}

/** The claim comments since the last release, oldest first. */
function activeClaims(list) {
  let start = 0;
  list.forEach((c, i) => {
    if (c.body.includes(RELEASE)) start = i + 1;
  });
  const out = [];
  for (const c of list.slice(start)) {
    const m = CLAIM.exec(c.body);
    if (m) out.push({ id: c.id, login: c.user.login, at: c.created_at, ...JSON.parse(m[1]) });
  }
  return out;
}

function describe(claim) {
  return `${claim.who} (${claim.login}) on \`${claim.branch || '?'}\` since ${claim.at.slice(0, 16).replace('T', ' ')}`;
}

function milestoneIssues(ms) {
  const all = ghJson(['api', `repos/${repo}/milestones?state=all&per_page=100`]);
  const m = all.find((x) => String(x.number) === ms || x.title === ms || x.title.toLowerCase().startsWith(ms.toLowerCase()));
  if (!m) throw new Error(`no milestone matches "${ms}"`);
  const issues = ghJson(['api', '--paginate', '--slurp', `repos/${repo}/issues?milestone=${m.number}&state=open&per_page=100`]).flat();
  return { m, numbers: issues.filter((i) => !i.pull_request).map((i) => i.number).sort((a, b) => a - b) };
}

let labelChecked = false;
function ensureLabel() {
  if (labelChecked) return;
  const names = ghJson(['label', 'list', '-R', repo, '--limit', '500', '--json', 'name']).map((l) => l.name);
  if (!names.includes(LABEL)) {
    gh(['label', 'create', LABEL, '-R', repo, '--color', 'FBCA04', '--description', 'Claimed: someone is working on it']);
  }
  labelChecked = true;
}

function postComment(n, body) {
  return JSON.parse(gh(['api', `repos/${repo}/issues/${n}/comments`, '--input', '-'], JSON.stringify({ body })));
}

function claimIssue(n, opts) {
  const issue = ghJson(['api', `repos/${repo}/issues/${n}`]);
  if (issue.state !== 'open') {
    console.log(`#${n} is closed, skipped`);
    return false;
  }
  const before = activeClaims(comments(n));
  const labeled = issue.labels.some((l) => l.name === LABEL);
  if (!opts.force && (before.length > 0 || labeled)) {
    const who = before.length
      ? describe(before[0])
      : `label set by hand (assignees: ${issue.assignees.map((a) => a.login).join(', ') || 'none'})`;
    console.log(`#${n} is already claimed: ${who}`);
    return false;
  }
  if (opts.force && before.length > 0) postComment(n, `🔓 Claim by ${before[0].who} taken over (--force).\n${RELEASE}`);
  const who = opts.as || `${git(['config', 'user.name']) || me} @ ${hostname()}`;
  const branch = opts.branch || git(['branch', '--show-current']);
  const meta = JSON.stringify({ who, branch });
  const mine = postComment(
    n,
    `🔒 **Claimed** by ${who} — branch \`${branch || '?'}\`.\nRelease with \`claim.mjs unclaim ${n}\` (delivery plugin) if you stop working on it.\n<!-- claim:v1 ${meta} -->`,
  );
  // Two claims at once: the oldest comment wins, the other side backs out.
  const winner = activeClaims(comments(n))[0];
  if (winner && winner.id !== mine.id) {
    gh(['api', '-X', 'DELETE', `repos/${repo}/issues/comments/${mine.id}`]);
    console.log(`#${n} was claimed a moment earlier: ${describe(winner)}`);
    return false;
  }
  ensureLabel();
  gh(['issue', 'edit', String(n), '-R', repo, '--add-label', LABEL, '--add-assignee', '@me']);
  console.log(`#${n} claimed: ${who} on \`${branch || '?'}\` — ${issue.title}`);
  return true;
}

function unclaimIssue(n) {
  const issue = ghJson(['api', `repos/${repo}/issues/${n}`]);
  const claims = activeClaims(comments(n));
  const labeled = issue.labels.some((l) => l.name === LABEL);
  if (claims.length === 0 && !labeled) {
    console.log(`#${n} is not claimed`);
    return;
  }
  postComment(n, `🔓 **Released**${claims.length ? ` (was ${claims[0].who})` : ''} — free to take.\n${RELEASE}`);
  const args = ['issue', 'edit', String(n), '-R', repo, '--remove-label', LABEL];
  if (issue.assignees.some((a) => a.login === me)) args.push('--remove-assignee', '@me');
  gh(args);
  console.log(`#${n} released — ${issue.title}`);
}

function list(opts) {
  const issues = ghJson(['api', '--paginate', '--slurp', `repos/${repo}/issues?state=open&per_page=100`])
    .flat()
    .filter((i) => !i.pull_request)
    .filter((i) => !opts.milestone || (i.milestone && (String(i.milestone.number) === opts.milestone || i.milestone.title.toLowerCase().startsWith(opts.milestone.toLowerCase()))))
    .sort((a, b) => a.number - b.number);
  const groups = new Map();
  for (const i of issues) {
    const key = i.milestone?.title ?? '(no milestone)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  for (const [title, list] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const taken = list.filter((i) => i.labels.some((l) => l.name === LABEL)).length;
    console.log(`\n${title}  (${list.length - taken} free, ${taken} claimed)`);
    for (const i of list) {
      const isClaimed = i.labels.some((l) => l.name === LABEL);
      let status = 'free   ';
      let detail = '';
      if (isClaimed) {
        const c = activeClaims(comments(i.number))[0];
        status = 'CLAIMED';
        detail = c ? `  ← ${describe(c)}` : `  ← ${i.assignees.map((a) => a.login).join(', ') || 'label only'}`;
      }
      console.log(`  ${status} #${String(i.number).padEnd(4)} ${i.title}${detail}`);
    }
  }
}

const [cmd = 'list', ...rest] = process.argv.slice(2);
try {
  const opts = parseArgs(rest);
  if (cmd === 'list') {
    list(opts);
  } else if (cmd === 'claim' || cmd === 'unclaim') {
    const targets = [...opts.issues];
    if (opts.milestone) {
      const { m, numbers } = milestoneIssues(opts.milestone);
      console.log(`${m.title}: ${numbers.length} open issues`);
      targets.push(...numbers);
    }
    if (targets.length === 0) throw new Error(`usage: node claim.mjs ${cmd} <issue...> | --milestone <n|title>`);
    let failed = 0;
    for (const n of targets) {
      if (cmd === 'claim') {
        if (!claimIssue(n, opts) && opts.issues.includes(n)) failed++;
      } else {
        unclaimIssue(n);
      }
    }
    process.exitCode = failed > 0 ? 1 : 0;
  } else {
    throw new Error(`unknown command "${cmd}" (list | claim | unclaim)`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 2;
}
