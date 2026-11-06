#!/usr/bin/env node
// Render a pull request's demo video from a demo.json (see ../SKILL.md for the format).
//
//   node render-demo.mjs <demo.json> [--out <file.mp4>] [--fps 30] [--webm] [--keep]
//
// Every scene is drawn by player.html in Chromium and stepped frame by frame (the page's animations are paused and
// seeked), so text stays sharp and no frame is dropped; ffmpeg encodes H.264 (yuv420p, faststart) that Slack, GitHub
// and browsers play inline. A `clip` scene puts a recorded .webm/.mp4 (e.g. a Playwright run) into the frame.
// Needs ffmpeg/ffprobe on PATH and Playwright (taken from the current project, else installed once into a cache).

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLAYWRIGHT = '1.64.0';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const demoPath = args.find((a, i) => !a.startsWith('--') && !['--out', '--fps'].includes(args[i - 1]));
if (!demoPath) { console.error('usage: render-demo.mjs <demo.json> [--out <file.mp4>] [--fps 30] [--webm] [--keep]'); process.exit(2); }
const demoAbs = path.resolve(demoPath);
const demoDir = path.dirname(demoAbs);
const demo = JSON.parse(fs.readFileSync(demoAbs, 'utf8'));
const fps = Number(opt('--fps', demo.fps || 30));
const out = path.resolve(opt('--out', path.join(demoDir, 'demo.mp4')));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-demo-'));
const log = (...m) => console.error('[pr-demo]', ...m);

for (const tool of ['ffmpeg', 'ffprobe']) if (spawnSync(tool, ['-version']).status !== 0) { console.error(`${tool} is needed on PATH`); process.exit(2); }

// ---------- Playwright: the project's own, else a cached install ----------
function loadPlaywright() {
  for (const base of [process.cwd(), demoDir]) {
    const req = createRequire(path.join(base, 'noop.js'));
    for (const name of ['playwright', '@playwright/test', 'playwright-core']) {
      try { const m = req(name); if (m.chromium) return { pw: m, cli: path.join(path.dirname(req.resolve(name)), 'cli.js') }; } catch { /* next */ }
    }
  }
  const cache = path.join(os.homedir(), '.cache', 'carnufex-showcase');
  const req = createRequire(path.join(cache, 'package.json'));
  try { return { pw: req('playwright'), cli: path.join(path.dirname(req.resolve('playwright')), 'cli.js') }; } catch { /* install below */ }
  log(`installing playwright@${PLAYWRIGHT} into ${cache} (once)`);
  fs.mkdirSync(cache, { recursive: true });
  if (!fs.existsSync(path.join(cache, 'package.json'))) fs.writeFileSync(path.join(cache, 'package.json'), '{"private":true}\n');
  const npm = spawnSync('npm', ['install', '--no-audit', '--no-fund', `playwright@${PLAYWRIGHT}`], { cwd: cache, stdio: 'inherit', shell: process.platform === 'win32' });
  if (npm.status !== 0) { console.error('npm install playwright failed'); process.exit(2); }
  return { pw: req('playwright'), cli: path.join(path.dirname(req.resolve('playwright')), 'cli.js') };
}
const { pw, cli } = loadPlaywright();
async function launch() {
  try { return await pw.chromium.launch(); } catch (e) {
    if (!/Executable doesn't exist|playwright install/i.test(e.message)) throw e;
    log('installing Chromium for Playwright (once)');
    spawnSync(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit' });
    return pw.chromium.launch();
  }
}

// ---------- assets ----------
const fileUrl = (p) => pathToFileURL(path.resolve(demoDir, p)).href;
const probe = (f) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim());
for (const s of demo.scenes) {
  if (s.type === 'compare') { s.before = fileUrl(s.before); s.after = fileUrl(s.after); }
  if (s.type === 'key' && typeof s.result === 'string') s.result = JSON.parse(fs.readFileSync(path.resolve(demoDir, s.result), 'utf8'));
  if (s.type === 'clip') {
    s.srcPath = path.resolve(demoDir, s.src);
    if (!fs.existsSync(s.srcPath)) { console.error(`clip not found: ${s.srcPath}`); process.exit(2); }
    const speed = s.speed || 1; const from = s.from || 0;
    const len = (s.to || probe(s.srcPath)) - from;
    s.seconds = s.seconds || Math.min(len / speed, s.maxSeconds || 20) + 0.6;
  }
}

// ---------- ffmpeg helpers ----------
const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(fps), '-an'];
function ffmpeg(argv, stdin) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: [stdin ? 'pipe' : 'ignore', 'inherit', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err += d; });
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg failed (${c}): ${err.slice(-800)}`))));
    if (stdin) stdin(p.stdin);
  });
}

// ---------- render ----------
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => log('page error:', e.message));
await page.addInitScript((d) => { window.DEMO = d; }, demo);
await page.goto(pathToFileURL(path.join(here, 'player.html')).href);
await page.waitForFunction(() => window.ready && window.mermaid, null, { timeout: 30000 });
await page.evaluate(() => window.ready);

const segments = [];
let poster = null;
for (let i = 0; i < demo.scenes.length; i++) {
  const s = demo.scenes[i];
  const info = await page.evaluate((k) => window.show(k), i);
  const seg = path.join(work, `seg-${String(i).padStart(2, '0')}.mp4`);
  const dur = info.duration / 1000;
  log(`scene ${i + 1}/${demo.scenes.length} ${s.type} ${dur.toFixed(1)} s`);
  if (s.type === 'clip') {
    await page.evaluate((t) => window.seek(t), info.settle);
    const bg = path.join(work, `bg-${i}.png`);
    await page.screenshot({ path: bg });
    const { x, y, w, h } = info.box; const speed = s.speed || 1;
    const fadeOut = Math.max(0, dur - 0.35);
    await ffmpeg(['-loop', '1', '-t', String(dur), '-i', bg, ...(s.from ? ['-ss', String(s.from)] : []), '-i', s.srcPath,
      '-filter_complex', `[1:v]setpts=(PTS-STARTPTS)/${speed},${s.crop ? `crop=${s.crop.w}:${s.crop.h}:${s.crop.x || 0}:${s.crop.y || 0},` : ''}scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,tpad=stop_mode=clone:stop_duration=${dur}[c];` +
        `[0:v][c]overlay=${x}:${y}:shortest=0,trim=duration=${dur},fade=t=in:st=0:d=0.3,fade=t=out:st=${fadeOut}:d=0.35,format=yuv420p[v]`,
      '-map', '[v]', ...ENC, seg]);
  } else {
    const frames = Math.round(dur * fps);
    let last = null;
    await ffmpeg(['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', ...ENC, seg], async (stdin) => {
      for (let f = 0; f < frames; f++) {
        const t = (f * 1000) / fps;
        const still = last && t > info.settle && t < info.duration - 400;
        if (!still) { await page.evaluate((tt) => window.seek(tt), t); last = await page.screenshot({ type: 'png' }); }
        if (!stdin.write(last)) await new Promise((r) => stdin.once('drain', r));
        if (s.poster || (!poster && (s.type === 'key' || s.type === 'flow') && t >= info.settle && !still)) { if (!poster || s.poster) poster = last; }
      }
      stdin.end();
    });
  }
  segments.push(seg);
}
await browser.close();

fs.mkdirSync(path.dirname(out), { recursive: true });
const list = path.join(work, 'list.txt');
fs.writeFileSync(list, segments.map((s) => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
if (poster) fs.writeFileSync(out.replace(/\.mp4$/, '.png'), poster);
if (args.includes('--webm')) await ffmpeg(['-i', out, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', out.replace(/\.mp4$/, '.webm')]);
if (!args.includes('--keep')) fs.rmSync(work, { recursive: true, force: true });
const total = probe(out);
console.log(JSON.stringify({ video: out, poster: poster ? out.replace(/\.mp4$/, '.png') : null, seconds: Number(total.toFixed(1)), bytes: fs.statSync(out).size }));
