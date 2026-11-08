#!/usr/bin/env node
// SessionStart hook: in a repository with a delivery profile, tell the session what waits on a person and which claims
// have gone stale, so it does not depend on remembering to look.
//
//   - open `needs-human` issues, marked "answered" when someone commented after the last question was asked;
//   - issues carrying an in-progress label (`status:in-progress` or `in-progress`) not updated for
//     GUARDRAILS_STALE_DAYS (default 7) days.
//
// Prints a SessionStart additionalContext as factual statements, or nothing. Fails silently (no gh, offline, not a
// repository, no profile): a slow or broken check must never stand in the way of starting a session.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const STALE_DAYS = Number(process.env.GUARDRAILS_STALE_DAYS || 7);
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).trim();

function main(input) {
  const cwd = input.cwd || process.cwd();
  let top;
  try { top = run('git', ['rev-parse', '--show-toplevel'], cwd); } catch { return null; }
  if (!fs.existsSync(path.join(top, '.claude', 'profiles', 'delivery.md'))) return null;

  const lines = [];
  try {
    const human = JSON.parse(run('gh', ['issue', 'list', '--label', 'needs-human', '--state', 'open', '--limit', '20', '--json', 'number,title,updatedAt,comments'], top));
    for (const i of human) {
      const last = i.comments?.at(-1);
      const answered = last && !/needs-human|What is needed from you|Vad behövs från dig/i.test(last.body || '') && last.author?.login !== 'github-actions';
      lines.push(`- #${i.number} ${i.title}${answered ? ' — has a newer comment, possibly the answer' : ''}`);
    }
    if (lines.length) lines.unshift('Open issues waiting on a person (needs-human):');
  } catch { /* gh missing or offline */ }

  const stale = [];
  for (const label of ['status:in-progress', 'in-progress']) {
    try {
      for (const i of JSON.parse(run('gh', ['issue', 'list', '--label', label, '--state', 'open', '--limit', '30', '--json', 'number,title,updatedAt,assignees'], top))) {
        const days = Math.floor((Date.now() - Date.parse(i.updatedAt)) / 86400000);
        if (days >= STALE_DAYS) stale.push(`- #${i.number} ${i.title} (claimed, untouched for ${days} days${i.assignees?.length ? `, ${i.assignees.map((a) => a.login).join(', ')}` : ''})`);
      }
    } catch { /* label missing */ }
  }
  if (stale.length) lines.push(`Claims with no activity for ${STALE_DAYS}+ days (the work-issue skill unclaims or continues them):`, ...stale);

  return lines.length ? `Delivery state of ${path.basename(top)} at session start:\n${lines.join('\n')}` : null;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  try {
    const context = main(JSON.parse(raw || '{}'));
    if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }));
  } catch { /* fail silently */ }
  process.exit(0);
});
