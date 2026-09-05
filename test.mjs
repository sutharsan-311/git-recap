// Run: node test.mjs   (no framework, on purpose)
import assert from 'node:assert/strict';
import { pickVerdict } from './src/verdict.js';
import { analyze } from './src/git.js';
import { heatmapSvg } from './src/report.js';
import { THEMES } from './src/themes.js';
import fs from 'node:fs';

// A repo with nothing remarkable: every rate sits at the TYPICAL baseline.
const ordinary = (over = {}) => ({
  total: 500,
  nightPct: 15, earlyPct: 12, weekendPct: 15, fixPct: 20, docsPct: 6,
  longestStreak: 7,
  lingo: { wip: 10, fix: 100, docs: 30 }, // 10/500 = 2% = baseline
  authors: [{ name: 'solo' }],
  ...over,
});

// 1. The original bug: a solo repo used to ALWAYS win with score 0.9.
//    Now solo is only the fallback when nothing is actually unusual.
assert.equal(pickVerdict(ordinary()).key, 'solo');
assert.equal(pickVerdict(ordinary({ nightPct: 60 })).key, 'night',
  'a real signal must beat the solo fallback');

// 2. Multi-author + nothing unusual falls through to the generic verdict.
assert.equal(pickVerdict(ordinary({ authors: [{}, {}] })).key, 'force');

// 3. The point of ratio scoring: the MOST unusual signal wins, not the biggest
//    raw number. 30% weekend (2.0x) beats 40% fix (2.0x)? No — 45% night is 3.0x.
const mixed = pickVerdict(ordinary({ nightPct: 45, fixPct: 40, weekendPct: 22.5 }));
assert.equal(mixed.key, 'night', `expected night (3.0x) to beat fix (2.0x), got ${mixed.key}`);

// ...and a small raw count still wins if it's far enough from typical.
// 8% wip is 4x baseline; 30% night is only 2x.
assert.equal(pickVerdict(ordinary({ nightPct: 30, lingo: { wip: 40, fix: 100, docs: 30 } })).key, 'wip');

// 4. Too few commits to say anything: no behavioural verdict, no solo claim.
assert.equal(pickVerdict(ordinary({ total: 5, nightPct: 90 })).key, 'force');

// 5. Every verdict is reachable and ships what the report needs to render it.
const only = {
  night:   { nightPct: 60 },
  early:   { earlyPct: 50 },
  weekend: { weekendPct: 60 },
  fix:     { fixPct: 70 },
  docs:    { docsPct: 40 },
  wip:     { lingo: { wip: 100, fix: 0, docs: 0 } },   // 100/500 = 20% = 10x typical
  streak:  { longestStreak: 60 },
};
const flat = { nightPct: 0, earlyPct: 0, weekendPct: 0, fixPct: 0, docsPct: 0, longestStreak: 0, lingo: { wip: 0, fix: 0, docs: 0 } };
for (const [key, signal] of Object.entries(only)) {
  const v = pickVerdict(ordinary({ ...flat, ...signal }));
  assert.equal(v.key, key, `expected ${key}, got ${v.key}`);
  assert.ok(v.title && v.emoji && v.blurb, `${key} is missing render fields`);
  assert.equal(v.score, undefined, `${key} leaked its raw score into the output`);
}

// ---------------------------------------------------------------- heatmap window
// Regression: the 53-week grid used to anchor on TODAY, so `--year 2024` run in
// 2026 rendered an empty grid. It must anchor on the last commit in range.
{
  const svg = heatmapSvg(
    { dailyCounts: { '2024-03-15': 7, '2024-12-20': 2 }, lastCommit: { date: '2024-12-20' } },
    THEMES.night,
  );
  assert.match(svg, /<title>2024-03-15: 7 commits<\/title>/, 'old dates must still be drawn');
  assert.match(svg, /<title>2024-12-20: 2 commits<\/title>/);
}

// -------------------------------------------------------------- language stats
// A lockfile bump is thousands of lines and must not take the top slot.
{
  const commit = (path, ins) => ({
    dateKey: '2025-01-01', hour: 12, subject: 'x',
    authorName: 'a', authorEmail: 'a@b.c',
    files: [{ path, ins, del: 0, binary: false }],
  });
  const st = analyze([
    commit('package-lock.json', 5000),
    commit('dist/bundle.min.js', 9000),
    commit('src/app.ts', 10),
  ]);
  assert.equal(st.langs.length, 1, 'generated files must not appear as languages');
  assert.equal(st.langs[0].name, 'TypeScript');
  assert.equal(st.ins, 10, 'generated files must not inflate the line count');
  assert.deepEqual(st.files.map((f) => f.path), ['src/app.ts'], 'generated files must not top the file list');
}

// ------------------------------------------------------------ deck determinism
// The confetti is seeded off the repo's stats so a regenerated screenshot diffs
// cleanly. A stray Math.random() anywhere in the deck silently undoes that.
{
  const src = fs.readFileSync('./src/report.js', 'utf8');
  assert.doesNotMatch(src, /Math\.random\s*\(/, 'the deck must not use unseeded randomness');
}


// Regression: an over-tight collision guard silently dropped a month label when a
// boundary landed <3 columns after the previous one, so a window starting mid-May
// rendered "May, Jul, Aug…". A calendar missing a month reads as broken.
{
  const svg = heatmapSvg(
    { dailyCounts: { '2026-05-20': 1 }, lastCommit: { date: '2026-05-20' } },
    THEMES.night,
  );
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const seen = [...svg.matchAll(/y="12"[^>]*>([A-Z][a-z]{2})</g)].map((m) => M.indexOf(m[1]));
  assert.ok(seen.length >= 12, `a 53-week window spans >=12 months, got ${seen.length}`);
  for (let i = 1; i < seen.length; i++) {
    assert.equal((seen[i - 1] + 1) % 12, seen[i], `month label skipped after ${M[seen[i - 1]]}`);
  }
}
console.log('ok — verdict scoring, heatmap window, language stats, deck determinism');
