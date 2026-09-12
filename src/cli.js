import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readLog, parseLog, analyze } from './git.js';
import { pickVerdict } from './verdict.js';
import { THEMES } from './themes.js';
import { buildHtml } from './report.js';
import { buildCardSvg } from './card.js';

// Single source of truth: package.json. A hardcoded copy here drifts the moment
// someone bumps one and not the other, and it is stamped into every deck.
const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const HELP = `
  git-recap · Spotify Wrapped for your git history

  USAGE
    npx git-recap [repo-path] [options]

  OPTIONS
    --year <yyyy>     limit to a calendar year (e.g. --year 2025)
    --since <date>    git date filter, passed through
    --until <date>    git date filter, passed through
    --author <name>   only commits matching this author
    --theme <name>    night (default) · synth · forest
    --out <dir>       output directory (default: <repo>/git-recap/)
    --no-open         don't open the story in your browser
    --json            print the stats JSON to stdout instead of writing files
    -h, --help        show this help
    -v, --version     show version

  OUTPUT (written to ./git-recap/)
    recap.html   the animated story (open it, arrow keys to navigate)
    recap.svg    share card for your README / social preview
    recap.json   the raw stats, for the data nerds
`;

/* ---------- tiny ANSI helpers (zero deps) ---------- */
const rgb = (r, g, b, s) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;
const BOLD = (s) => `\x1b[1m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

const BANNER = [
  '   ▄▄▄   ▄▄▄·  ▄· ▄▌ ▄▄· ▄▄▄ .',
  '  ▒█████▐█ ▀█ ▐█ ▌█▐█ ▌▪▀▄.▀·',
  '  ▒█▒█▒█▄█▀▀█ ██ ██▜. ██▐▀▀▪▄',
  '  ▒█░█▒█▐█ ▪▐▌▐█ ▐█▐█ ▌█▐█▄▄▌',
  '  ▒▀▀▀░ ▀  ▀  ▀  ▀ ▀▀▀▀  ▀▀▀ ',
];

function printBanner() {
  for (let i = 0; i < BANNER.length; i++) {
    const steps = [
      [255, 110, 196], [255, 141, 160], [255, 172, 125], [255, 195, 110], [255, 214, 110],
    ][i];
    console.log(rgb(...steps, BOLD(BANNER[i])));
  }
}

function printSummary(s) {
  const c = (t) => rgb(255, 195, 110, t);
  const m = (t) => rgb(138, 125, 255, t);
  console.log('');
  console.log(`  ${BOLD('★ ' + fmt(s.total) + ' commits')} ${DIM('·')} ${c(fmt(s.activeDays) + ' active days')} ${DIM('·')} ${m('+' + fmt(s.ins) + ' lines')}`);
  console.log(`  ${c(s.longestStreak + '-day streak')} ${DIM('·')} ${m(fmt(s.ghostCommits) + ' commits after midnight')} ${DIM('·')} ${c(Math.round(s.nightPct) + '% at night')}`);
  if (s.langs[0]) console.log(`  Top language: ${BOLD(s.langs[0].name)} ${DIM('(' + Math.round(s.langs[0].share * 100) + '% of lines written)')}`);
  console.log('');
  console.log(`  ${BOLD(s.verdict.emoji + ' ' + s.verdict.title)}`);
  console.log(`  ${DIM(s.verdict.blurb)}`);
  console.log('');
}

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

/* ---------- args ---------- */
function parseArgs(argv) {
  const opts = { repo: '.', theme: 'night', open: true, json: false, out: null, since: null, until: null, year: null, author: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[i + 1];
      if (v === undefined) { console.error(`missing value for ${a}`); process.exit(1); }
      i++; return v;
    };
    if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
    else if (a === '-v' || a === '--version') { console.log(VERSION); process.exit(0); }
    else if (a === '--no-open') opts.open = false;
    else if (a === '--json') opts.json = true;
    else if (a === '--theme') opts.theme = val();
    else if (a === '--out') opts.out = val();
    else if (a === '--since') opts.since = val();
    else if (a === '--until') opts.until = val();
    else if (a === '--year') opts.year = val();
    else if (a === '--author') opts.author = val();
    else if (a.startsWith('--theme=')) opts.theme = a.slice(8);
    else if (a.startsWith('--out=')) opts.out = a.slice(6);
    else if (a.startsWith('--since=')) opts.since = a.slice(8);
    else if (a.startsWith('--until=')) opts.until = a.slice(8);
    else if (a.startsWith('--year=')) opts.year = a.slice(7);
    else if (a.startsWith('--author=')) opts.author = a.slice(9);
    else if (a.startsWith('--')) { console.error(`unknown option: ${a}`); process.exit(1); }
    else opts.repo = a;
  }
  return opts;
}

// Snap and flatpak browsers run in their own mount namespace: they get a private
// /tmp, and the `home` interface deliberately excludes dotfile directories. So
// xdg-open cheerfully hands them a path they cannot read -- the browser starts,
// finds nothing, and sits on a spinner forever with no error printed anywhere.
// Pure and platform-free so it stays testable; the caller gates it on linux.
export function sandboxUnreadable(p) {
  if (/^\/(?:var\/)?tmp(?:\/|$)/.test(p)) return true;
  return p.split(path.sep).some((seg) => seg.startsWith('.') && seg !== '.' && seg !== '..');
}

// file:// URLs must go through pathToFileURL: concatenating 'file://' + a path
// breaks on Windows drive letters, spaces and non-ASCII. Pure and exported so
// it stays testable, like sandboxUnreadable below.
export const fileUrl = (p) => pathToFileURL(p).href;

// A repo whose history sits inside one calendar year printed "2026 – 2026" on the
// share card. Exported so it stays testable, like the two helpers above.
export function rangeYears(s) {
  if (!s.firstCommit || !s.lastCommit) return '';
  const a = s.firstCommit.date.slice(0, 4);
  const b = s.lastCommit.date.slice(0, 4);
  return a === b ? a : `${a} – ${b}`;
}

function openBrowser(filePath) {
  const url = fileUrl(filePath);
  const plat = process.platform;
  const cmd = plat === 'darwin' ? 'open' : plat === 'win32' ? 'cmd' : 'xdg-open';
  const args = plat === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

/* ---------- main ---------- */
export function main(argv) {
  const opts = parseArgs(argv);
  const theme = THEMES[opts.theme];
  if (!theme) {
    console.error(`unknown theme "${opts.theme}" — choose: ${Object.keys(THEMES).join(', ')}`);
    process.exit(1);
  }
  const repo = path.resolve(opts.repo);
  if (!fs.existsSync(path.join(repo, '.git'))) {
    console.error(`\n  ✖ ${repo} is not a git repository.\n\n  cd into a repo and run ${BOLD('npx git-recap')}\n`);
    process.exit(1);
  }
  if (opts.year) {
    opts.since = opts.since || `${opts.year}-01-01`;
    opts.until = opts.until || `${opts.year}-12-31T23:59:59`;
  }

  const filters = { since: opts.since, until: opts.until, author: opts.author };

  console.error(DIM('  ● reading git history…'));
  let commits;
  try {
    commits = parseLog(readLog(repo, filters), filters);
  } catch (e) {
    if (/does not have any commits|unknown revision|bad revision/i.test(e.message)) {
      console.error('  ✖ no commits found for this range — nothing to wrap.');
    } else {
      console.error(`  ✖ ${e.message}`);
    }
    process.exit(1);
  }
  if (!commits.length) {
    console.error('  ✖ no commits found for this range — nothing to wrap.');
    process.exit(1);
  }
  console.error(DIM(`  ● analyzing ${fmt(commits.length)} commits…`));

  const s = analyze(commits);
  s.verdict = pickVerdict(s);
  s.repo = path.basename(repo);

  const range = rangeYears(s);

  if (opts.json) {
    console.log(JSON.stringify(s, null, 2));
    return;
  }

  const outDir = path.resolve(opts.out || path.join(repo, 'git-recap'));
  fs.mkdirSync(outDir, { recursive: true });

  const htmlPath = path.join(outDir, 'recap.html');
  const svgPath = path.join(outDir, 'recap.svg');
  const jsonPath = path.join(outDir, 'recap.json');

  fs.writeFileSync(htmlPath, buildHtml(s, theme, { repo: s.repo, year: opts.year, theme: theme.id, generatedAt: new Date().toISOString(), version: VERSION }));
  fs.writeFileSync(svgPath, buildCardSvg(s, theme, { repo: s.repo, range }));
  fs.writeFileSync(jsonPath, JSON.stringify(s, null, 2));

  printBanner();
  printSummary(s);
  console.log(`  ${DIM('story     →')} ${BOLD(htmlPath)}`);
  console.log(`  ${DIM('share card→')} ${BOLD(svgPath)}  ${DIM('(drop it in your README)')}`);
  console.log(`  ${DIM('raw stats →')} ${BOLD(jsonPath)}`);
  console.log('');
  console.log(`  ${DIM('tip: scroll through the story · "Save share card" exports a PNG')}`);
  console.log('');

  if (opts.open && process.stdout.isTTY) {
    console.error(DIM('  ● opening the story in your browser…'));
    if (process.platform === 'linux' && sandboxUnreadable(htmlPath)) {
      console.error(DIM('    note: snap/flatpak browsers cannot read this path and will hang on a'));
      console.error(DIM('    blank tab. Re-run with --out somewhere under your home directory, or'));
      console.error(DIM('    open the file above in an unconfined browser.'));
    }
    openBrowser(htmlPath);
  }
}
