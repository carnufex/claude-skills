#!/usr/bin/env node
// Generates the README's animated SVGs (CSS keyframes, no scripts, so GitHub plays them in an <img>):
//   delivery-loop.svg  the path from an issue to verified production, one stage at a time
//   guardrails.svg     a terminal where the guardrails hooks refuse what must never happen
// node docs/media/build-svg.mjs   (writes next to this file)
// Without animation (reduced motion, a renderer without CSS) both show their finished state.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C = { bg: '#0b0f17', panel: '#121a2a', panel2: '#18223a', line: '#263252', ink: '#e8edf6', muted: '#8e9ab3', accent: '#7aa2ff', ok: '#3fd27a', bad: '#ff6b6b', warn: '#f2b84b' };
const SANS = "'Segoe UI', Inter, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'Cascadia Mono', Consolas, Menlo, monospace";
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (x) => `${Math.max(0, Math.min(100, x)).toFixed(2)}%`;

function frame(w, h, body, style, { plain = false } = {}) {
  const deco = plain ? '' : `<rect width="${w}" height="${h}" rx="22" fill="url(#grid)"/>
<rect width="${w}" height="${h}" rx="22" fill="url(#gb)"/>
<rect width="${w}" height="${h}" rx="22" fill="url(#gg)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">
<style>
${style}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
<defs>
  <radialGradient id="gb" cx="88%" cy="-10%" r="70%"><stop offset="0" stop-color="${C.accent}" stop-opacity=".20"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></radialGradient>
  <radialGradient id="gg" cx="-5%" cy="110%" r="60%"><stop offset="0" stop-color="${C.ok}" stop-opacity=".13"/><stop offset="1" stop-color="${C.ok}" stop-opacity="0"/></radialGradient>
  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#fff" stroke-opacity=".035"/></pattern>
  <linearGradient id="prog" x1="0" x2="1"><stop offset="0" stop-color="${C.accent}"/><stop offset="1" stop-color="${C.ok}"/></linearGradient>
  <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6"/></filter>
</defs>
<rect width="${w}" height="${h}" rx="22" fill="${C.bg}"/>
${deco}
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="21.5" fill="none" stroke="${C.line}"/>
${body}
</svg>
`;
}

// ---------------------------------------------------------------- delivery-loop.svg
function deliveryLoop() {
  const W = 1200, H = 470, T = 18; // seconds per cycle
  const Y = 236, X0 = 108, STEP = (W - 2 * X0) / 6;
  const HOLD = 7, TRAVEL = 7, END = 92; // percent of the cycle
  const at = (i) => i * (HOLD + TRAVEL);
  const icon = {
    issue: `<circle r="11" fill="none" stroke-width="2.4"/><circle r="3.5" stroke="none"/>`,
    key: `<rect x="-10" y="-3" width="20" height="15" rx="3" stroke="none"/><path d="M-6 -3v-5a6 6 0 0 1 12 0v5" fill="none" stroke-width="2.6"/>`,
    build: `<path d="M-6 -8l-8 8 8 8M6 -8l8 8-8 8" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    review: `<circle cx="-3" cy="-3" r="8" fill="none" stroke-width="2.6"/><path d="M3 3l8 8" stroke-width="3" stroke-linecap="round"/>`,
    demo: `<path d="M-6 -10L11 0-6 10z" stroke="none"/>`,
    slack: `<path d="M-12 -9h24a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H-2l-7 6v-6h-3a3 3 0 0 1-3-3V-6a3 3 0 0 1 3-3z" stroke="none"/>`,
    ship: `<path d="M-14 1h7l4-9 6 17 4-8h7" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  };
  const nodes = [
    ['issue', 'Issue', ['acceptance criteria', '+ a review key'], [['#12 ready', C.accent]]],
    ['key', 'Review key', ['committed first,', 'then frozen'], [['spec · frozen', C.warn]]],
    ['build', 'Build', ['until the key', 'passes'], [['key ✗ FAIL', C.bad, 'fail'], ['key ✓ PASS', C.ok, 'pass']]],
    ['review', 'key-reviewer', ['base fails, head', 'passes, no gaming'], [['PASS · independent', C.ok]]],
    ['demo', 'PR + demo', ['a 30 s video and', 'the flowchart'], [['▶ 0:32', C.accent]]],
    ['slack', 'Slack thread', ['one per PR, each', 'step a reply'], [['#pr-demos · 4 replies', C.accent]]],
    ['ship', 'Ship', ['merge, deploy,', 'check it live'], [['live ✓', C.ok]]],
  ];

  let css = `
text { font-family: ${SANS}; }
.ring { fill: ${C.panel2}; stroke: ${C.ok}; stroke-width: 2.5; }
.ico { fill: ${C.ink}; stroke: ${C.ink}; }
.halo { fill: ${C.accent}; opacity: 0; }
.chip { opacity: .9; }
.chip.fail { opacity: 0; }
.dot { opacity: 0; animation: dot ${T}s linear infinite; }
.progress { transform-box: fill-box; transform-origin: left center; animation: prog ${T}s linear infinite; }
.scan { opacity: 0; animation: scan ${T}s linear infinite; }
`;
  // the travelling dot: hold at each stage, move between them
  let dot = '@keyframes dot {\n';
  let prog = '@keyframes prog {\n';
  let scan = '@keyframes scan {\n';
  for (let i = 0; i < 7; i++) {
    const x = i * STEP;
    dot += `  ${pct(at(i))}, ${pct(at(i) + HOLD)} { transform: translateX(${x.toFixed(1)}px); opacity: 1; }\n`;
    prog += `  ${pct(at(i))}, ${pct(at(i) + HOLD)} { transform: scaleX(${(i / 6).toFixed(4)}); }\n`;
    scan += `  ${pct(at(i))}, ${pct(at(i) + HOLD)} { transform: translateX(${x.toFixed(1)}px); opacity: .9; }\n`;
  }
  dot += `  ${pct(END + 3)}, 100% { transform: translateX(${(6 * STEP).toFixed(1)}px); opacity: 0; }\n}\n`;
  prog += `  ${pct(END)} { transform: scaleX(1); opacity: 1; }\n  ${pct(END + 5)}, 100% { transform: scaleX(1); opacity: 0; }\n}\n`;
  scan += `  ${pct(END + 3)}, 100% { transform: translateX(${(6 * STEP).toFixed(1)}px); opacity: 0; }\n}\n`;
  css += dot + prog + scan;

  const off = `fill: ${C.panel}; stroke: ${C.line};`, active = `fill: ${C.panel2}; stroke: ${C.accent};`, done = `fill: ${C.panel2}; stroke: ${C.ok};`;
  let body = '';
  // header
  body += `<text x="56" y="58" font-size="14" font-weight="700" letter-spacing="2.6" fill="${C.accent}">FROM ISSUE TO VERIFIED PRODUCTION</text>
<text x="56" y="94" font-size="27" font-weight="700" fill="${C.ink}">Done is decided before the work, and checked by someone else.</text>
<text x="${W - 56}" y="58" font-size="14" text-anchor="end" fill="${C.muted}"><tspan font-weight="700" fill="${C.ink}">carnufex</tspan> · claude-skills</text>\n`;
  // track
  body += `<rect x="${X0}" y="${Y - 1.5}" width="${6 * STEP}" height="3" rx="1.5" fill="${C.line}"/>
<rect class="progress" x="${X0}" y="${Y - 1.5}" width="${6 * STEP}" height="3" rx="1.5" fill="url(#prog)"/>\n`;
  // the dot travels under the nodes: seen between stages, hidden behind the stage it stops at
  body += `<g class="dot"><circle cx="${X0}" cy="${Y}" r="14" fill="${C.accent}" opacity=".45" filter="url(#glow)"/><circle cx="${X0}" cy="${Y}" r="6" fill="#fff"/></g>\n`;
  nodes.forEach(([kind, title, sub, chips], i) => {
    const x = X0 + i * STEP, a = at(i);
    const ring = `@keyframes r${i} { 0%${a > 0 ? `, ${pct(a - 0.6)}` : ''} { ${off} } ${pct(a)}, ${pct(a + HOLD)} { ${active} } ${pct(a + HOLD + 3)}, ${pct(END)} { ${done} } ${pct(END + 5)}, 100% { ${off} } }`;
    const ico = `@keyframes i${i} { 0%${a > 0 ? `, ${pct(a - 0.6)}` : ''} { fill: ${C.muted}; stroke: ${C.muted}; } ${pct(a)}, ${pct(END)} { fill: ${C.ink}; stroke: ${C.ink}; } ${pct(END + 5)}, 100% { fill: ${C.muted}; stroke: ${C.muted}; } }`;
    const halo = `@keyframes h${i} { 0%${a > 0 ? `, ${pct(a - 0.6)}` : ''} { opacity: 0; } ${pct(a + 0.8)}, ${pct(a + HOLD)} { opacity: .5; } ${pct(a + HOLD + 3)}, 100% { opacity: 0; } }`;
    css += `${ring}\n${ico}\n${halo}\n.n${i} .ring { animation: r${i} ${T}s linear infinite; } .n${i} .ico { animation: i${i} ${T}s linear infinite; } .n${i} .halo { animation: h${i} ${T}s linear infinite; }\n`;
    body += `<g class="n${i}" transform="translate(${x.toFixed(1)} ${Y})">
  <circle class="halo" r="40" filter="url(#glow)"/>
  <circle class="ring" r="31"/>
  <g class="ico">${icon[kind]}</g>
</g>
<text x="${x.toFixed(1)}" y="${Y + 66}" font-size="19" font-weight="700" text-anchor="middle" fill="${C.ink}">${esc(title)}</text>
<text x="${x.toFixed(1)}" y="${Y + 92}" font-size="15" text-anchor="middle" fill="${C.muted}">${esc(sub[0])}</text>
<text x="${x.toFixed(1)}" y="${Y + 112}" font-size="15" text-anchor="middle" fill="${C.muted}">${esc(sub[1])}</text>\n`;
    chips.forEach(([text, color, role], k) => {
      const wch = text.length * 8.5 + 28;
      const id = `c${i}${k}`;
      let kf;
      if (role === 'fail') kf = `0%, ${pct(a - 0.6)} { opacity: 0; } ${pct(a + 0.5)}, ${pct(a + HOLD / 2)} { opacity: 1; } ${pct(a + HOLD / 2 + 0.6)}, 100% { opacity: 0; }`;
      else if (role === 'pass') kf = `0%, ${pct(a + HOLD / 2)} { opacity: 0; transform: translateY(6px); } ${pct(a + HOLD / 2 + 0.8)} { opacity: 1; transform: none; } ${pct(END)} { opacity: .9; transform: none; } ${pct(END + 5)}, 100% { opacity: 0; transform: none; }`;
      else kf = `0%${a > 0 ? `, ${pct(a - 0.6)}` : ''} { opacity: 0; transform: translateY(6px); } ${pct(a + 1.2)} { opacity: 1; transform: none; } ${pct(END)} { opacity: .9; transform: none; } ${pct(END + 5)}, 100% { opacity: 0; transform: none; }`;
      css += `@keyframes ${id} { ${kf} }\n.${id} { animation: ${id} ${T}s linear infinite; }\n`;
      body += `<g class="chip ${role || ''} ${id}"><rect x="${(x - wch / 2).toFixed(1)}" y="${Y - 84}" width="${wch.toFixed(1)}" height="30" rx="15" fill="${C.bg}" stroke="${color}" stroke-opacity=".7"/>
<text x="${x.toFixed(1)}" y="${Y - 63.5}" font-size="14.5" font-weight="700" text-anchor="middle" fill="${color}" font-family="${MONO}">${esc(text)}</text></g>\n`;
    });
  });
  // guardrails band, with a scanner that follows the dot
  const by = H - 62;
  body += `<rect x="56" y="${by}" width="${W - 112}" height="40" rx="12" fill="${C.warn}" fill-opacity=".06" stroke="${C.warn}" stroke-opacity=".45" stroke-dasharray="5 5"/>
<g class="scan"><rect x="${X0 - 50}" y="${by + 1}" width="100" height="38" rx="10" fill="${C.warn}" fill-opacity=".14"/></g>
<path transform="translate(80 ${by + 20})" d="M0 -11l9 3.5v6c0 6-4 9.5-9 11.5-5-2-9-5.5-9-11.5v-6z" fill="${C.warn}" fill-opacity=".9"/>
<text x="100" y="${by + 25.5}" font-size="15.5" fill="${C.ink}"><tspan font-weight="700" fill="${C.warn}">guardrails</tspan>  every git command is checked: explicit staging · fetch before push · frozen review keys · a 3 am line in every PR</text>\n`;
  return frame(W, H, body, css);
}

// ---------------------------------------------------------------- guardrails.svg
function guardrails() {
  const W = 1200, LH = 25, TOP = 84, X = 40, CH = 9.03; // monospace advance at 15px
  const steps = [
    ['$ git add -A', ['✗ guardrails: stage explicit paths (git add <path> …), never git add -A: other sessions may have changes here.', C.bad]],
    ['$ git add src/users.js test/plus.test.mjs', null],
    ['$ git commit -m "Accept any plus tag in the local part (#12)"', ['✓ [12-plus-in-email 4c1e9a2] 2 files changed', C.ok]],
    ['$ git push', ['✗ guardrails: fetch before you push: nothing fetched in the last 15 minutes. Other sessions push here too.', C.bad]],
    ['$ git fetch && git push -u origin 12-plus-in-email', ['✓ branch 12-plus-in-email set up to track origin', C.ok]],
    ['$ gh pr create --fill', ['✗ guardrails: a pull request here needs a body with a 3 am: line (the delivery profile asks for it).', C.bad]],
  ];
  const lines = steps.reduce((n, [, o]) => n + 1 + (o ? 1 : 0), 0);
  const H = TOP + lines * LH + 40;
  const CPS = 26, T0 = 0.6; // chars per second, start delay
  let t = T0;
  const items = [];
  let row = 0;
  for (const [cmd, out] of steps) {
    const dur = (cmd.length - 2) / CPS;
    items.push({ kind: 'cmd', text: cmd, row: row++, start: t, end: t + dur });
    t += dur + 0.45;
    if (out) { items.push({ kind: 'out', text: out[0], color: out[1], row: row++, start: t }); t += 1.1; } else t += 0.3;
  }
  const T = t + 3.2; // hold the full screen, then restart
  const p = (s) => pct((s / T) * 100);
  let css = `text { font-family: ${MONO}; font-size: 15px; white-space: pre; }\n`;
  let body = `<rect x="0" y="0" width="${W}" height="46" rx="22" fill="${C.panel}"/><rect x="0" y="24" width="${W}" height="22" fill="${C.panel}"/>
<line x1="0" y1="46" x2="${W}" y2="46" stroke="${C.line}"/>
<circle cx="30" cy="23" r="6.5" fill="${C.bad}" fill-opacity=".85"/><circle cx="52" cy="23" r="6.5" fill="${C.warn}" fill-opacity=".85"/><circle cx="74" cy="23" r="6.5" fill="${C.ok}" fill-opacity=".85"/>
<text x="${W / 2}" y="28" text-anchor="middle" fill="${C.muted}" style="font-family: ${SANS}; font-size: 13.5px">Claude's Bash tool · guardrails PreToolUse hook</text>\n`;
  items.forEach((it, k) => {
    const y = TOP + it.row * LH;
    if (it.kind === 'cmd') {
      const w = (it.text.length) * CH;
      const prompt = `<tspan fill="${C.accent}">$</tspan><tspan fill="${C.ink}">${esc(it.text.slice(1))}</tspan>`;
      body += `<text x="${X}" y="${y}">${prompt}</text>\n`;
      // a cover in the background colour slides right, char by char; the cursor rides on its edge
      const n = it.text.length - 2;
      css += `@keyframes t${k} { 0%, ${p(it.start - 0.36)} { transform: translateX(0px); } ${p(it.start - 0.35)}, ${p(it.start)} { transform: translateX(${(2 * CH).toFixed(1)}px); } ${p(it.end)}, 100% { transform: translateX(${w.toFixed(1)}px); } }
.t${k} { transform: translateX(${w.toFixed(1)}px); animation: t${k} ${T}s infinite; animation-timing-function: steps(${n}, end); }
@keyframes k${k} { 0%, ${p(it.start - 0.4)} { opacity: 0; } ${p(it.start - 0.35)}, ${p(it.end + 0.4)} { opacity: 1; } ${p(it.end + 0.45)}, 100% { opacity: 0; } }
.k${k} { opacity: 0; animation: k${k} ${T}s step-end infinite; }\n`;
      body += `<g class="t${k}"><rect x="${X}" y="${y - 17}" width="${W}" height="${LH}" fill="${C.bg}"/><rect class="k${k}" x="${X}" y="${y - 15}" width="${CH.toFixed(1)}" height="19" fill="${C.accent}"/></g>\n`;
    } else {
      css += `@keyframes o${k} { 0%, ${p(it.start)} { opacity: 0; } ${p(it.start + 0.15)}, 100% { opacity: 1; } }\n.o${k} { animation: o${k} ${T}s infinite; }\n`;
      const [mark, ...rest] = it.text.split(' ');
      body += `<text class="o${k}" x="${X + 2 * CH}" y="${y}"><tspan fill="${it.color}" font-weight="700">${esc(mark)}</tspan><tspan fill="${it.color === C.bad ? '#ffc9c9' : C.muted}"> ${esc(rest.join(' '))}</tspan></text>\n`;
    }
  });
  // fade everything out at the end of the cycle so it restarts cleanly
  css += `@keyframes all { 0%, ${p(T - 0.6)} { opacity: 1; } ${p(T - 0.1)}, 100% { opacity: 0; } }\n.screen { animation: all ${T}s infinite; }\n`;
  const chrome = body.slice(0, body.indexOf('<text x="' + X));
  const screen = body.slice(chrome.length);
  return frame(W, H, `${chrome}<g class="screen">\n${screen}</g>`, css, { plain: true });
}

fs.writeFileSync(path.join(HERE, 'delivery-loop.svg'), deliveryLoop());
fs.writeFileSync(path.join(HERE, 'guardrails.svg'), guardrails());
console.log('wrote delivery-loop.svg, guardrails.svg');
