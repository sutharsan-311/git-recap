#!/usr/bin/env node
// Generates a deterministic demo repo (~970 commits over ~2 years) for testing/demoing.
// Usage: node scripts/make-demo-repo.mjs [target-dir]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve(process.argv[2] || 'demo-repo');
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.join(target, 'src'), { recursive: true });
fs.mkdirSync(path.join(target, 'docs'), { recursive: true });
const g = (args, env = {}) => execFileSync('git', ['-C', target, ...args], { env: { ...process.env, ...env } });
g(['init', '-q']);
g(['config', 'user.email', 'dev@demo.io']);
g(['config', 'user.name', 'Dev Demo']);
g(['config', 'commit.gpgsign', 'false']);

// Base epoch: 2024-09-01T00:00:00Z
const BASE = Date.UTC(2024, 8, 1);
const DAY = 86400000;

const AUTHORS = [
  { name: 'Alex Rivera', email: 'alex@demo.io', nightOwl: true, weight: 0.55 },
  { name: 'Sam Chen', email: 'sam@demo.io', nightOwl: false, weight: 0.3 },
  { name: 'Jules Kim', email: 'jules@demo.io', nightOwl: false, weight: 0.15 },
];

const FILES = [
  ['src/app.ts', ['feat', 'fix', 'refactor', 'perf']],
  ['src/engine.ts', ['feat', 'fix', 'perf']],
  ['src/cli.ts', ['feat', 'fix', 'chore']],
  ['src/utils.ts', ['fix', 'refactor']],
  ['README.md', ['docs', 'chore', 'docs']],
  ['docs/architecture.md', ['docs', 'docs']],
  ['package.json', ['chore', 'fix']],
  ['src/styles.css', ['style', 'fix']],
];

// Rates for the "flavour" commits, stated once and on purpose. These feed the
// verdict engine and the lingo slide, so they need to look like a real repo —
// when 'wip' lived inside the per-file verb lists above it worked out to 9.8%
// of all commits (~5x reality) and every demo run came back "The Eternal Draft".
const RATE = { wip: 0.02, oops: 0.012, final: 0.008, emoji: 0.06, dot: 0.004 };
const SUBJECTS = {
  feat: ['add streaming parser', 'implement retry queue', 'add --watch mode', 'support custom themes', 'add incremental indexing', 'wire up plugin hooks'],
  fix: ['fix off-by-one in parser', 'fix race in queue', 'fix broken symlink handling', 'fix crash on empty input', 'fix timezone bug', 'hotfix memory leak', 'fix flaky test'],
  refactor: ['refactor parser core', 'clean up engine', 'extract config module', 'simplify error paths'],
  wip: ['wip', 'wip: middleware', 'draft: new indexer', 'wip (do not review)'],
  docs: ['docs: update readme', 'docs: architecture notes', 'update contributing guide', 'fix typo in docs'],
  chore: ['bump deps', 'chore: release v0.3.0', 'update tooling'],
  style: ['tweak spacing', 'fix hover state'],
  perf: ['speed up indexing 2x', 'cache file stats', 'lazy-load parser'],
  test: ['add parser tests', 'test: cover edge cases'],
  final: ['final', 'FINAL final v2 (for real this time)', 'final fix, promise'],
  oops: ['oops', 'typo', 'ugh fix indent', 'really final this time'],
};
const EMOJI = ['✨', '🔥', '🐛', '🚀', '💡'];

// Simple deterministic RNG (mulberry32)
let seed = 42;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

let n = 0;
const lines = ['let x = 0;', 'export function step() { return x++; }', '// TODO: make this faster', 'const cache = new Map();', 'if (!ready) return null;'];

for (let day = 0; day < 700; day += 1) {
  const date = new Date(BASE + day * DAY);
  const dow = date.getUTCDay();
  // skip stretches to create streaks + gaps; skip most weekends for Sam/Jules vibe
  if (rnd() < (dow === 0 || dow === 6 ? 0.62 : 0.25)) continue;
  const commitsToday = 1 + Math.floor(rnd() * (rnd() < 0.15 ? 6 : 3));
  for (let c = 0; c < commitsToday; c++) {
    const r = rnd();
    let acc = 0; let author = AUTHORS[0];
    for (const a of AUTHORS) { acc += a.weight; if (r <= acc) { author = a; break; } }
    let hour;
    if (author.nightOwl) hour = pick([22, 23, 0, 1, 2, 3, 1, 2, 21, 20]);
    else hour = pick([9, 10, 11, 14, 15, 16, 8, 20]);
    const minute = Math.floor(rnd() * 60);
    const when = new Date(BASE + day * DAY + hour * 3600000 + minute * 60000);
    const iso = when.toISOString().slice(0, 19) + '+00:00';

    let [file, verbs] = pick(FILES);
    let verb = pick(verbs);
    for (const flavour of ['wip', 'oops', 'final']) if (rnd() < RATE[flavour]) verb = flavour;
    let subject = pick(SUBJECTS[verb] || ['update']);
    if (rnd() < RATE.emoji) subject += ' ' + pick(EMOJI);
    if (rnd() < RATE.dot) subject = '.';

    fs.appendFileSync(path.join(target, file), pick(lines) + '\n');
    if (n % 40 === 0) fs.appendFileSync(path.join(target, 'README.md'), '\n## Notes ' + n + '\nChangelog line ' + n + '.\n');
    g(['add', '-A']);
    const env = { GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso, GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email, GIT_COMMITTER_NAME: author.name, GIT_COMMITTER_EMAIL: author.email };
    g(['commit', '-q', '--allow-empty', '-m', subject], env);
    n++;
  }
}
console.log(`demo repo ready at ${target} (${n} commits)`);
