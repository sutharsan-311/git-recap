#!/usr/bin/env node
// Regenerates the README screenshots from a generated deck, using whatever Chrome
// is already on the machine. Zero dependencies, same as the rest of this repo.
//
// Usage: node scripts/make-screenshots.mjs [deck.html] [out-dir]
//   CHROME=/path/to/chrome  to point at a specific binary
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const deck = path.resolve(process.argv[2] || 'example/recap.html');
const outDir = path.resolve(process.argv[3] || 'docs/screenshots');

// Output name -> the slide's data-title. Keyed on TITLE, not index: the languages,
// files and crew slides only render when there's data for them, so a repo with one
// author or no recognised languages shifts every index after it.
const SHOTS = {
  'story-cover': 'Cover',
  'story-heatmap': 'Heatmap',
  'story-verdict': 'Verdict',
  'story-crew': 'The crew',
};

const WIDTH = 1440;
const HEIGHT = 900;

// Frames to advance before capturing. The deck's confetti seeds deterministically
// but still MOVES, so the capture has to land on a chosen frame rather than
// wherever Chrome's virtual time happened to stop. 140 frames (~2.3s) drops the
// particles into the middle of the shot, comfortably inside the 4200ms at which
// the burst clears itself.
// ponytail: chosen by eye. Re-tune if the deck's confetti timing changes.
const FRAMES = 185;
const FRAME_MS = 1000 / 60;

// Only needs to cover load + decode now that frames are driven by hand.
const BUDGET_MS = 3000;

// Chrome's --virtual-time-budget fast-forwards timers and rAF but NOT CSS
// transitions or animations. The deck fades slides with a transition and reveals
// their contents with a delayed animation, so without this the shot is either
// blank or shows two slides stacked. Pin both to the end state they'd reach on
// screen, and hide inactive slides outright — visibility on the parent beats the
// forced opacity on its children.
//
// The blanket transition kill matters beyond the slides: the progress bar and the
// slide counter/dots animate too, and they were the last source of run-to-run
// pixel drift (differences showed up only in the top and bottom 50px).
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

// Slides aren't deep-linkable — the index lives in a closure — so walk to the
// target with the deck's own keyboard handler.
//
// Then run the animations on a fake clock. Chrome's virtual time advances rAF at
// its own pace, so two runs of the same deck stop on different frames and produce
// different pixels. Queueing the callbacks and stepping them by hand makes the
// captured frame an input instead of a race.
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
    for (let f = 0; f < ${FRAMES}; f++) {
      t += ${FRAME_MS};
      for (const cb of queue.splice(0)) cb(t);
    }
    // Belt and braces: the count-ups settle within 60 frames, but pin them anyway
    // so FRAMES stays free to be tuned for the confetti alone.
    document.querySelectorAll('[data-cu]').forEach((el) => {
      el.textContent = Number(el.dataset.cu).toLocaleString('en-US');
    });
  });
})();
</script>`;

function runnable(bin) {
  try {
    execFileSync(bin, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function findChrome() {
  if (process.env.CHROME) {
    if (runnable(process.env.CHROME)) return process.env.CHROME;
    console.error(`  \u2716 CHROME=${process.env.CHROME} is not runnable.`);
    process.exit(1);
  }
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    if (runnable(bin)) return bin;
  }
  console.error('  ✖ no Chrome or Chromium found. Install one, or set CHROME=/path/to/binary.');
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
  try {
    execFileSync(chrome, args, { stdio: 'ignore' });
  } catch {
    // Containers and root shells need the sandbox off; don't disable it by default.
    execFileSync(chrome, ['--no-sandbox', ...args], { stdio: 'ignore' });
  }
}

if (!fs.existsSync(deck)) {
  console.error(`  ✖ ${deck} not found. Generate a deck first:\n\n      node bin/git-recap.js demo-repo --no-open --out example\n`);
  process.exit(1);
}

const chrome = findChrome();
const html = fs.readFileSync(deck, 'utf8');
const titles = [...html.matchAll(/data-title="([^"]*)"/g)].map((m) => m[1]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'git-recap-shots-'));
fs.mkdirSync(outDir, { recursive: true });

let failed = 0;
try {
  for (const [name, title] of Object.entries(SHOTS)) {
    const idx = titles.indexOf(title);
    if (idx === -1) {
      console.error(`  ✖ ${name}: no slide titled "${title}" in this deck — skipped.`);
      failed++;
      continue;
    }
    const htmlFile = path.join(tmp, `${name}.html`);
    const pngFile = path.join(outDir, `${name}.png`);
    // Into <head>, not before </body>: the stub in drive() has to be in place before
    // the deck's own script runs and builds its observer.
    fs.writeFileSync(htmlFile, html.replace('</head>', `${FREEZE(idx)}\n${drive(idx)}\n</head>`));
    shoot(chrome, htmlFile, pngFile);

    // A slide that failed to reveal still renders as a valid PNG — just an empty
    // gradient, which compresses to a fraction of a real one. Size is the cheapest
    // signal that the freeze/drive step actually worked.
    // ponytail: crude threshold. If it ever false-positives, compare pixels instead.
    const kb = Math.round(fs.statSync(pngFile).size / 1024);
    if (kb < 60) {
      console.error(`  ✖ ${name}.png is only ${kb}KB — the slide probably rendered blank.`);
      failed++;
    } else {
      console.log(`  ✔ ${name}.png  (slide ${idx + 1}/${titles.length} · ${WIDTH}×${HEIGHT} · ${kb}KB)`);
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? `\n  ${failed} screenshot(s) need a look.` : `\n  wrote ${Object.keys(SHOTS).length} screenshots to ${outDir}`);
process.exit(failed ? 1 : 0);
