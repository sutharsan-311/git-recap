#!/usr/bin/env node
// Builds the README demo GIF from the example deck: one still per slide, held
// long enough to read, encoded with a per-clip palette.
//
// GIF, not MP4, on purpose: GitHub's README renderer strips inline <video>, and
// npmjs.com renders the same README — a GIF is the only format both autoplay.
//
// Usage: node scripts/make-demo-gif.mjs [deck.html] [out.gif]
//   CHROME=/path/to/chrome   FFMPEG=/path/to/ffmpeg
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const deck = path.resolve(process.argv[2] || 'example/recap.html');
const out = path.resolve(process.argv[3] || 'docs/demo.gif');

const WIDTH = 1440;
const HEIGHT = 900;
const GIF_WIDTH = 800;          // 5MB is the README budget; 800px keeps us well under
const SECONDS_PER_SLIDE = 1.7;  // long enough to read a headline, short enough to loop
const FRAMES = 185;             // same frame as the stills: confetti mid-air
const FRAME_MS = 1000 / 60;
const BUDGET_MS = 3000;

// Chrome fast-forwards rAF but not CSS animation, so pin the reveals to their end
// state and hide inactive slides. Identical reasoning to make-screenshots.mjs.
const FREEZE = (i) => `<style>
* { transition: none !important; }
/* Two separate problems, one block.
   WHICH slide is on camera is chosen here, in CSS, by position — not by reading the
   deck's own .active class. The deck decides what's active from scroll position via
   an IntersectionObserver now, and that observer fires a task after the synthetic
   keydown walk below and overwrites where the walk landed: the verdict shot came out
   as the end card. nth-of-type cannot be argued with. The walk still runs, because it
   is what starts the confetti and the count-ups.
   WHERE it is drawn is the second problem. Slides sit in normal flow now, one window
   tall each, so the tenth is nine screens down — and headless Chrome screenshots the
   top of the document, not wherever the page happens to be scrolled. Taking every
   slide out of flow leaves nothing to scroll, so the top of the document IS the
   viewport and the chosen slide is on camera by construction. */
.slide {
  position: fixed !important; inset: 0 !important; min-height: 0 !important;
  opacity: 0 !important; visibility: hidden !important;
}
.slide:nth-of-type(${i + 1}) { opacity: 1 !important; visibility: visible !important; transform: none !important; }
.rv { opacity: 1 !important; transform: none !important; animation: none !important; }
</style>`;

const drive = (steps) => `<script>
(() => {
  // The deck watches slides with an IntersectionObserver and sets the counter, the
  // dots and the progress bar from whatever is on screen. Every slide is pinned to
  // the viewport by FREEZE above, so all eleven "intersect" and the last one wins:
  // the verdict still had 11/11 under it. Stubbed out, the walk below is the only
  // thing that moves the deck's state, which is what the stills should show.
  IntersectionObserver = function () { return { observe() {}, unobserve() {}, disconnect() {} }; };
  let t = 0;
  const queue = [];
  requestAnimationFrame = (cb) => queue.push(cb);
  performance.now = () => t;
  addEventListener('load', () => {
    for (let i = 0; i < ${steps}; i++) dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    for (let f = 0; f < ${FRAMES}; f++) { t += ${FRAME_MS}; for (const cb of queue.splice(0)) cb(t); }
    document.querySelectorAll('[data-cu]').forEach((el) => {
      el.textContent = Number(el.dataset.cu).toLocaleString('en-US');
    });
  });
})();
</script>`;

const runnable = (bin) => {
  try { execFileSync(bin, ['-version'], { stdio: 'ignore' }); return true; } catch {}
  try { execFileSync(bin, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
};

function find(envVar, candidates, what) {
  if (process.env[envVar]) {
    if (runnable(process.env[envVar])) return process.env[envVar];
    console.error(`  ✖ ${envVar}=${process.env[envVar]} is not runnable.`);
    process.exit(1);
  }
  for (const c of candidates) if (runnable(c)) return c;
  console.error(`  ✖ no ${what} found. Set ${envVar}=/path/to/binary.`);
  process.exit(1);
}

function shoot(chrome, htmlFile, pngFile) {
  const args = [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${WIDTH},${HEIGHT}`,
    `--virtual-time-budget=${BUDGET_MS}`,
    `--screenshot=${pngFile}`,
    `file://${htmlFile}`,
  ];
  try { execFileSync(chrome, args, { stdio: 'ignore' }); }
  catch { execFileSync(chrome, ['--no-sandbox', ...args], { stdio: 'ignore' }); }
}

if (!fs.existsSync(deck)) {
  console.error(`  ✖ ${deck} not found. Generate a deck first:\n\n      node bin/git-recap.js demo-repo --no-open --out example\n`);
  process.exit(1);
}

const chrome = find('CHROME', ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'], 'Chrome');
const ffmpeg = find('FFMPEG', ['ffmpeg'], 'ffmpeg');

const html = fs.readFileSync(deck, 'utf8');
const count = [...html.matchAll(/class="slide"/g)].length;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'git-recap-gif-'));
fs.mkdirSync(path.dirname(out), { recursive: true });

try {
  for (let i = 0; i < count; i++) {
    const page = path.join(tmp, `p${i}.html`);
    fs.writeFileSync(page, html.replace('</head>', `${FREEZE(i)}${drive(i)}</head>`));
    shoot(chrome, page, path.join(tmp, `f${String(i + 1).padStart(3, '0')}.png`));
    process.stderr.write(`\r  ● captured ${i + 1}/${count}`);
  }
  process.stderr.write('\n');

  // One shared palette across every frame: a per-frame palette makes flat gradients
  // shimmer between slides, which reads as compression artefacts.
  const filter = `scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192[p];[b][p]paletteuse=dither=bayer:bayer_scale=3`;
  execFileSync(ffmpeg, [
    '-y', '-loglevel', 'error',
    '-framerate', String(1 / SECONDS_PER_SLIDE),
    '-i', path.join(tmp, 'f%03d.png'),
    '-vf', filter, '-loop', '0', out,
  ], { stdio: 'inherit' });

  const kb = Math.round(fs.statSync(out).size / 1024);
  console.error(`\n  ✔ ${path.relative(process.cwd(), out)} · ${count} slides · ${(count * SECONDS_PER_SLIDE).toFixed(1)}s · ${kb}KB`);
  if (kb > 5120) console.error('  ! over 5MB — GitHub will load it slowly. Drop GIF_WIDTH or SECONDS_PER_SLIDE.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
