// Run: node test.mjs   (no framework, on purpose)
import assert from 'node:assert/strict';
import { pickVerdict } from './src/verdict.js';
import { analyze, parseLog } from './src/git.js';
import { heatmapSvg, identiconSvg } from './src/report.js';
import { THEMES } from './src/themes.js';
import { buildCardSvg } from './src/card.js';
import { sandboxUnreadable, fileUrl } from './src/cli.js';
import fs from 'node:fs';

// A repo with nothing remarkable: every rate sits at the TYPICAL baseline.
const ordinary = (over = {}) => ({
  total: 500,
  nightPct: 15, earlyPct: 12, weekendPct: 15, fixPct: 20, docsPct: 6,
  longestStreak: 7,
  firstCommit: { date: '2025-01-01' },
  lastCommit: { date: '2025-12-31' },
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

// Streak used to be scored as a raw day count divided by 7 — an unbounded number
// ranked against bounded shares — so any repo with a 40+ day streak won
// Marathoner regardless of anything else, and the verdict converged there forever
// as the repo aged. It is now a share of the repo's committed lifespan, so age
// cancels: a 60-day streak in a 3-year-old repo is 5.5% of its life (1.8x, not a
// personality) and a strong behavioural signal wins again.
{
  const oldRepo = {
    firstCommit: { date: '2022-01-01' },
    lastCommit: { date: '2024-12-31' }, // 1,096-day span
    longestStreak: 60,                  // 5.5% of the span — real, not remarkable
  };
  assert.equal(pickVerdict(ordinary({ ...oldRepo, nightPct: 60 })).key, 'night',
    'a 60-day streak in a 3-year-old repo must not beat a 4x behavioural signal');
}

// 3b. Streak's sample size is DAYS, not commits. The small-sample gate below
//     multiplies a baseline by the sample it was measured over; feeding it the
//     commit count works for the six share-of-commits signals but not for this
//     one, and put the Marathoner cutoff at an arbitrary 5/0.03 = 167 commits
//     — the same unit mix the streak score itself was just fixed for.
{
  // A repo committed to sparsely but relentlessly: 200 of its 730 days in one
  // run is 27% of its life, 9x baseline. It earns Marathoner on 80 commits.
  assert.equal(pickVerdict(ordinary({
    total: 80, longestStreak: 200,
    firstCommit: { date: '2023-01-01' }, lastCommit: { date: '2024-12-31' },
  })).key, 'streak', 'a marathon streak must not need 167 commits to count');

  // The mirror of the original bug: over a 12-day span the share is trivially
  // 1.0, so a fortnight-old repo must not out-marathon a three-year one.
  assert.notEqual(pickVerdict(ordinary({
    total: 200, longestStreak: 12,
    firstCommit: { date: '2024-01-01' }, lastCommit: { date: '2024-01-12' },
  })).key, 'streak', '12 days is too short a life to have a streak share at all');
}

// 4. Too few commits to say anything: no behavioural verdict, no solo claim.
assert.equal(pickVerdict(ordinary({ total: 5, nightPct: 90 })).key, 'force');

// 4b. The gate is per-signal: a 15% base rate cannot be estimated from 10
//     samples, and 2 night commits out of 10 used to crown The Midnight
//     Architect. A signal may only win when its baseline predicts ~5 events
//     (total * TYPICAL[key] >= 5); below that, fall through to the fallback.
assert.equal(pickVerdict(ordinary({ total: 12, nightPct: 50 })).key, 'force',
  '2 night commits out of 12 is noise, not a personality');

// ...but the gate must not over-gate: 24 night commits out of 40 clears it.
assert.equal(pickVerdict(ordinary({ total: 40, nightPct: 60 })).key, 'night');

// 4c. "Nothing unusual found" used to read as an earned compliment ("Perfectly
//     balanced, as all codebases should be"). It is a description, not an award.
const noSignal = pickVerdict(ordinary({ authors: [{}, {}] }));
assert.doesNotMatch(noSignal.blurb, /perfectly balanced/i,
  'the no-signal fallback must not present ordinariness as an achievement');

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

// --------------------------------------------------------------------- merges
// s.merges was computed by a second full git pass (rev-list --count --merges)
// and rendered nowhere: grep -c merges src/report.js src/card.js is 0, 0.
// Dead data — the field and the pass are gone.
{
  const st = analyze([{
    dateKey: '2025-01-01', hour: 12, subject: 'x',
    authorName: 'a', authorEmail: 'a@b.c',
    files: [{ path: 'src/a.ts', ins: 1, del: 0, binary: false }],
  }]);
  assert.ok(!('merges' in st), 'merges was computed and never rendered');
}

// ------------------------------------------------------------------ date windows
// --since/--until used to be passed to git, which filters on COMMITTER date,
// while the heatmap and power hours bucket on AUTHOR date (%aI). Rebasing a
// year of work last month made the two disagree, and git dropped the commits
// before the parser ever saw them. The window is now applied here, on the
// author date the deck buckets by, so they cannot disagree.
{
  const rec = (hash, aDate, subject) =>
    `\x01${hash}\x02A\x03a@x.c\x04${aDate}\x05${subject}\n1\t0\tsrc/a.ts`;
  const out =
    rec('in-range', '2024-06-01T03:00:00+00:00', 'real work') +
    rec('rebased', '2026-01-05T03:00:00+00:00', 'same work, rebased last month');
  const commits = parseLog(out, { since: '2024-01-01', until: '2024-12-31T23:59:59' });
  assert.equal(commits.length, 1, 'a rebase must not drag 2026 commits into a 2024 window');
  assert.equal(commits[0].hash, 'in-range');
  assert.equal(parseLog(out).length, 2, 'with no window, nothing is dropped');
}

// -------------------------------------------------------------------- identicons
// Crew avatars are drawn locally from the email. Deliberately not fetched: a
// remote avatar would make every deck phone home on open, contradicting the
// "generated 100% locally" line the cover slide prints.
{
  const ink = (svg) => svg.match(/<g fill="([^"]+)"/)[1];

  // Same person, same face — across decks, and regardless of how it's typed.
  assert.equal(
    identiconSvg('dev@demo.io', THEMES.night),
    identiconSvg('DEV@Demo.IO', THEMES.night),
    'identicons must be stable per author',
  );
  assert.notEqual(
    identiconSvg('a@x.com', THEMES.night),
    identiconSvg('b@x.com', THEMES.night),
    'different authors must not share a face',
  );

  // Regression: colour came straight off the hash, so 3 authors drawn from an
  // 8-colour palette collided ~30% of the time and the crew read as one blur.
  const used = new Set();
  const inks = ['sutharsanmail311@gmail.com', '159125892+gpt-engineer-app[bot]@users.noreply.github.com', '144416509+sutharsan-311@users.noreply.github.com']
    .map((e) => ink(identiconSvg(e, THEMES.night, used)));
  assert.equal(new Set(inks).size, inks.length, `crew colours must be distinct, got ${inks}`);

  // Nothing fetched. (Not a bare /https?:/ check — the SVG namespace is a URL.)
  assert.doesNotMatch(
    identiconSvg('a@x.com', THEMES.night),
    /(?:src|href)=|url\(/,
    'identicons must not fetch anything',
  );
}

// ------------------------------------------------------------------ animated card
// The card is 1200x630 -- Open Graph size -- so preview scrapers, thumbnailers and
// headless screenshots all sample it as a still. An <img>-loaded SVG sampled at
// t=0 renders the FIRST keyframe, so a `from`/`0%` step that hides anything hands
// every one of them a blank card. Verified in Chrome: a `from { fill: blue }` rule
// rendered blue, not the element's own red. Mid-cycle steps only.
{
  const stats = {
    total: 970, longestStreak: 13, ghostCommits: 308,
    langs: [{ name: 'TypeScript', share: 0.48 }],
    verdict: { emoji: '🦉', title: 'The Midnight Architect', blurb: 'up late.' },
  };
  const svg = buildCardSvg(stats, THEMES.night, { repo: 'demo', range: '2024 - 2026' });
  const style = svg.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.doesNotMatch(style, /(?:^|[\s{])(?:from|0%)\s*\{/, 'card keyframes must not define a t=0 state');
  assert.match(style, /prefers-reduced-motion/, 'card motion must be opt-out');
  assert.doesNotMatch(svg, /(?:src|href)=|url\(#?['"]?http/, 'the card must stay self-contained');
}

// -------------------------------------------------------------- sandboxed browsers
// A snap browser gets a private /tmp and no access to dotfile directories, so
// xdg-open handed it a path it could not read: the browser cold-started, found
// nothing, wedged, and then swallowed every later open with no error anywhere.
{
  for (const p of ['/tmp/x/wrapped.html', '/var/tmp/wrapped.html', '/tmp', '/home/u/.cache/w/wrapped.html', '/home/u/proj/.next/wrapped.html']) {
    assert.equal(sandboxUnreadable(p), true, `${p} is not readable by a confined browser`);
  }
  for (const p of ['/home/u/proj/git-wrapped/wrapped.html', '/home/u/Desktop/w/wrapped.html', '/srv/code/wrapped.html', '/home/u/tmp/wrapped.html']) {
    assert.equal(sandboxUnreadable(p), false, `${p} is fine and must not warn`);
  }
}
// ------------------------------------------------------------------ README claims
// The README invites a source audit, so its self-describing numbers are asserted
// against the things they describe. All three had drifted at once: a fixed "11
// slides" (three render conditionally — languages, files, crew), "8
// personalities" (7 behavioural candidates + 2 fallbacks), "~700 lines" for a
// 1,422-line source tree.
{
  const readme = fs.readFileSync('./README.md', 'utf8');

  // Slides: the languages, files and crew slides only render when there's data
  // for them, so the deck size varies per repo; no fixed count may be claimed.
  assert.doesNotMatch(readme, /11 animated slides/, 'slide count is conditional, not a fixed 11');

  // Personalities: every behavioural candidate in pickVerdict plus the fallbacks.
  const verdictSrc = fs.readFileSync('./src/verdict.js', 'utf8');
  const behavioural = (verdictSrc.match(/^\s*add\(/gm) || []).length;
  const fallbacks = (verdictSrc.match(/^\s{2}\w+: \{$/gm) || []).length;
  assert.ok(
    readme.includes(`one of ${behavioural + fallbacks} deterministic coding personalities`),
    `README personality count does not match code: code offers ${behavioural + fallbacks}`,
  );

  // Source size: the "~N lines" claim must track the actual tree, within 10%.
  const count = (f) => fs.readFileSync(f, 'utf8').split('\n').length - 1;
  const files = [
    ...fs.readdirSync('./src').map((f) => `src/${f}`),
    ...fs.readdirSync('./bin').map((f) => `bin/${f}`),
  ].filter((f) => f.endsWith('.js'));
  const srcLines = files.reduce((n, f) => n + count(f), 0);
  const claimed = readme.match(/~([\d,]+) lines/);
  assert.ok(claimed, 'README states an approximate source size');
  const n = Number(claimed[1].replace(/,/g, ''));
  assert.ok(Math.abs(n - srcLines) / srcLines < 0.1, `README says ~${n} lines, source is ${srcLines}`);
}

// ----------------------------------------------------------------------- nits
// file:// URLs were built by string concatenation ('file://' + path), which
// breaks on spaces, non-ASCII and fragments, and on Windows drive letters —
// and Windows is the only platform here with no other coverage. pathToFileURL
// encodes all of it. (The drive-letter form file:///C:/... itself can only be
// exercised on a Windows runner; the encoding bugs below reproduce everywhere.)
{
  assert.equal(fileUrl('/home/u/my repo/wrapped.html'), 'file:///home/u/my%20repo/wrapped.html');
  assert.equal(fileUrl('/home/üser/wrapped.html'), 'file:///home/%C3%BCser/wrapped.html');
  assert.equal(fileUrl('/w/r#1.html'), 'file:///w/r%231.html', 'a raw # silently truncates the URL at the fragment');
}

// topVerbs excluded 'add', 'update' and 'new' — the three most common commit
// verbs — so the "commit lingo" slide showed your top verbs WITH your actual
// top verbs removed. It shows them now.
{
  const commit = (subject) => ({
    dateKey: '2025-01-01', hour: 12, subject,
    authorName: 'a', authorEmail: 'a@b.c',
    files: [{ path: 'src/a.ts', ins: 1, del: 0, binary: false }],
  });
  const st = analyze([
    commit('add feature one'), commit('add feature two'), commit('add feature three'),
    commit('add feature four'), commit('add feature five'),
    commit('refactor engine'), commit('refactor engine'),
  ]);
  assert.equal(st.topVerbs[0].word, 'add', 'the most common verb must not be filtered out');
  assert.equal(st.topVerbs[0].n, 5);
}

// The language share counts .md/.json/.yaml/.txt lines, so calling it "code
// written" overclaims — Markdown is not code. Both places that print the share
// (share card, terminal summary) now say lines.
{
  const stats = {
    total: 10, longestStreak: 1, ghostCommits: 0,
    langs: [{ name: 'Markdown', share: 0.9 }],
    verdict: { emoji: '🗺️', title: 'The Cartographer', blurb: 'docs.' },
  };
  const svg = buildCardSvg(stats, THEMES.night, { repo: 'demo', range: '' });
  assert.doesNotMatch(svg, /of code written/, 'the card must not call doc lines code');
  assert.match(svg, /of lines written/);
  assert.doesNotMatch(fs.readFileSync('./src/cli.js', 'utf8'), /of code written/);
}

console.log('ok — verdict scoring, heatmap window, language stats, identicons, animated card, sandboxed browsers, deck determinism, README claims, date windows, merges, CLI nits');
