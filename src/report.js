import { buildCardSvg } from './card.js';

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hourLabel = (h) => { const m = h % 12 === 0 ? 12 : h % 12; return `${m}${h < 12 ? 'am' : 'pm'}`; };

function rangeLabel(s) {
  if (!s.firstCommit || !s.lastCommit) return '';
  const p = (k) => { const [y, m] = k.split('-'); return `${MONTHS[Number(m) - 1]} ${y}`; };
  return `${p(s.firstCommit.date)} – ${p(s.lastCommit.date)}`;
}

function shortPath(p, max = 42) {
  if (p.length <= max) return p;
  const parts = p.split('/');
  let out = parts[parts.length - 1];
  let i = parts.length - 2;
  while (i >= 0 && out.length + parts[i].length + 4 < max) { out = parts[i] + '/' + out; i--; }
  return '…/' + out;
}

/* ---------- SVG charts ---------- */

export function heatmapSvg(s, t) {
  const cell = 13, gap = 3, step = cell + gap, padL = 34, padT = 20;
  const cols = 53;
  // Anchor the 53-week window to the last commit IN RANGE, not to today. Anchoring
  // to today meant `--year 2024`, run in 2026, drew a 2025-26 grid with nothing in it.
  const anchor = s.lastCommit ? new Date(s.lastCommit.date + 'T00:00:00Z') : new Date();
  const anchorUtc = Math.floor(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()) / 86400000);
  const endUtc = anchorUtc + (6 - anchor.getUTCDay());
  const startUtc = endUtc - cols * 7 + 1;
  const dayKey = (d) => new Date(d * 86400000).toISOString().slice(0, 10);
  const max = Math.max(1, ...Object.values(s.dailyCounts));

  const level = (v) => (v <= 0 ? 0 : v < max * 0.25 ? 1 : v < max * 0.5 ? 2 : v < max * 0.75 ? 3 : 4);

  // Month labels: one per boundary column, minus any month too narrow to hold the
  // text. Dropping the NARROW month matters: the old pass ran left to right and
  // always kept column 0, so the partial month at the window's edge survived and
  // the first full month was the one dropped ("Jul, Sep, Oct...").
  const bounds = [];
  for (let c = 0; c < cols; c++) {
    const d0 = startUtc + c * 7;
    if (d0 > endUtc) break;
    const m = new Date(d0 * 86400000).getUTCMonth();
    if (!bounds.length || bounds[bounds.length - 1].m !== m) bounds.push({ c, m });
  }
  const labels = bounds
    .filter((b, i) => !bounds[i + 1] || bounds[i + 1].c - b.c >= 2)
    .map((b) => `<text x="${padL + b.c * step}" y="12" font-size="10" fill="${t.faint}" font-family="system-ui,sans-serif">${MONTHS[b.m]}</text>`)
    .join('');

  let rects = '';
  for (let c = 0; c < cols; c++) {
    const d0 = startUtc + c * 7;
    for (let r = 0; r < 7; r++) {
      const d = d0 + r;
      if (d > endUtc) break;
      const key = dayKey(d);
      const v = s.dailyCounts[key] || 0;
      rects += `<rect x="${padL + c * step}" y="${padT + r * step}" width="${cell}" height="${cell}" rx="3" fill="${t.heat[level(v)]}"><title>${key}: ${fmt(v)} commit${v === 1 ? '' : 's'}</title></rect>`;
    }
  }
  const wl = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']].map(([r, l]) =>
    `<text x="24" y="${padT + r * step + cell - 3}" font-size="10" fill="${t.faint}" text-anchor="end" font-family="system-ui,sans-serif">${l}</text>`).join('');
  const legend = t.heat.map((c, i) => `<rect x="${padL + cols * step - 96 + i * 18}" y="${padT + 7 * step + 6}" width="11" height="11" rx="3" fill="${c}"/>`).join('');

  return `<svg viewBox="0 0 ${padL + cols * step} ${padT + 7 * step + 24}" width="100%" style="max-width:900px" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Commit heatmap">
    ${labels}${wl}${rects}
    <text x="${padL + cols * step - 110}" y="${padT + 7 * step + 16}" font-size="10" fill="${t.faint}" text-anchor="end" font-family="system-ui,sans-serif">less</text>
    ${legend}
    <text x="${padL + cols * step + 4}" y="${padT + 7 * step + 16}" font-size="10" fill="${t.faint}" font-family="system-ui,sans-serif">more</text>
  </svg>`;
}

function arcPath(cx, cy, r1, r2, a0, a1) {
  const rad = (a) => ((a - 90) * Math.PI) / 180;
  const p = (r, a) => `${(cx + r * Math.cos(rad(a))).toFixed(2)},${(cy + r * Math.sin(rad(a))).toFixed(2)}`;
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p(r2, a0)} A ${r2} ${r2} 0 ${large} 1 ${p(r2, a1)} L ${p(r1, a1)} A ${r1} ${r1} 0 ${large} 0 ${p(r1, a0)} Z`;
}

function clockSvg(s, t) {
  const cx = 210, cy = 210, r1 = 76;
  const max = Math.max(1, ...s.hourCounts);
  const powerHour = s.hourCounts.indexOf(Math.max(...s.hourCounts));
  let wedges = '';
  for (let h = 0; h < 24; h++) {
    const frac = s.hourCounts[h] / max;
    const len = 6 + frac * 100;
    const a0 = h * 15 + 1.1;
    const a1 = (h + 1) * 15 - 1.1;
    const op = (0.22 + frac * 0.78).toFixed(2);
    wedges += `<path d="${arcPath(cx, cy, r1, r1 + len, a0, a1)}" fill="url(#clockGrad)" opacity="${h === powerHour ? 1 : op}" ${h === powerHour ? `stroke="${t.text}" stroke-width="1.5"` : ''}><title>${hourLabel(h)} — ${fmt(s.hourCounts[h])} commits</title></path>`;
  }
  const lbl = [[0, '12am', cx, cy - r1 - 118], [6, '6am', cx + r1 + 118, cy + 4], [12, '12pm', cx, cy + r1 + 130], [18, '6pm', cx - r1 - 118, cy + 4]]
    .map(([h, l, x, y]) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="12" font-weight="600" fill="${t.faint}" font-family="system-ui,sans-serif">${l}</text>`).join('');
  return `<svg viewBox="0 0 420 420" width="100%" style="max-width:380px" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Commits by hour">
    <defs><linearGradient id="clockGrad" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="${t.b1}"/><stop offset="100%" stop-color="${t.a1}"/></linearGradient></defs>
    ${wedges}${lbl}
    <text x="${cx}" y="${cy - 14}" text-anchor="middle" font-size="44" font-weight="800" fill="${t.text}" font-family="system-ui,sans-serif">${hourLabel(powerHour)}</text>
    <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="12" letter-spacing="2" fill="${t.faint}" font-family="system-ui,sans-serif">PEAK HOUR</text>
    <text x="${cx}" y="${cy + 42}" text-anchor="middle" font-size="13" fill="${t.muted}" font-family="system-ui,sans-serif">${fmt(s.hourCounts[powerHour])} commits</text>
  </svg>`;
}

function donutSvg(s, t) {
  const cx = 190, cy = 190, r1 = 84, r2 = 134;
  const top = s.langs.slice(0, 5);
  const otherShare = Math.max(0, 1 - top.reduce((a, l) => a + l.share, 0));
  const segs = [...top.map((l, i) => ({ name: l.name, share: l.share, color: l.color || t.palette[i] })),
    ...(otherShare > 0.005 ? [{ name: 'Other', share: otherShare, color: t.palette[t.palette.length - 1] }] : [])];
  let a = 0;
  let paths = '';
  for (const g of segs) {
    const a1 = a + g.share * 360;
    paths += `<path d="${arcPath(cx, cy, r1, r2, a + 1.4, a1 - 1.4)}" fill="${g.color}"><title>${esc(g.name)} — ${(g.share * 100).toFixed(1)}%</title></path>`;
    a = a1;
  }
  const legend = segs.map((g, i) => `
    <div class="lg-row rv" style="--d:${0.15 + i * 0.07}s">
      <span class="lg-dot" style="background:${g.color}"></span>
      <span class="lg-name">${esc(g.name)}</span>
      <span class="lg-pct">${Math.max(1, Math.round(g.share * 100))}%</span>
    </div>`).join('');
  return `<div class="donut-wrap">
    <svg viewBox="0 0 380 380" width="100%" style="max-width:330px" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Languages">${paths}
      <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="34" font-weight="800" fill="${t.text}" font-family="system-ui,sans-serif">+${fmt(s.ins)}</text>
      <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="12" letter-spacing="2" fill="${t.faint}" font-family="system-ui,sans-serif">LINES ADDED</text>
    </svg>
    <div class="legend">${legend}</div>
  </div>`;
}

// The confetti was unseeded, so the verdict slide rendered differently every time
// and regenerated screenshots always produced a dirty diff. It draws from this
// seed instead: identical every time you open a given deck, still different
// between repos. FNV-1a, 32-bit. test.mjs guards against unseeded randomness
// creeping back into the deck.
function fnv1a(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function confettiSeed(s) {
  return fnv1a(`${s.repo}:${s.total}:${s.ins}:${s.longestStreak}`);
}

/* ---------- identicons ---------- */
// Faces for the crew slide, drawn from the author's email. Deliberately NOT
// fetched: a remote avatar would make the deck phone home every time someone
// opens it, which breaks the "generated 100% locally" line on slide 1, and only
// GitHub noreply addresses encode a resolvable user anyway.
const IDENT_GRID = 5; // cells per side; odd so the mirrored halves share a centre column
// Only the vivid head of the palette. The tail entries are muted greys meant for
// the donut's long tail, and a crew drawn from those looks washed out next to the
// rest of the deck. Six is still ample for the three authors this slide shows.
const IDENT_INKS = 6;

export function identiconSvg(seed, t, used, px = 26) {
  const h = fnv1a(seed.toLowerCase());
  // Colour comes from the hash so a person looks the same across decks, but three
  // picks from an eight-colour palette collide about a third of the time (birthday
  // problem) and the crew reads as one blue blur. Step to the next free colour.
  const inks = t.palette.slice(0, IDENT_INKS);
  let ci = h % inks.length;
  if (used) {
    for (let n = 0; n < inks.length && used.has(ci); n++) ci = (ci + 1) % inks.length;
    used.add(ci);
  }
  const fill = inks[ci];
  // xorshift32 rather than raw hash bits: FNV's low bits are correlated, which
  // shows up as visible banding down the grid.
  let b = h || 1;
  const bit = () => {
    b ^= b << 13; b ^= b >>> 17; b ^= b << 5;
    return (b >>> 0) & 1;
  };
  const half = Math.ceil(IDENT_GRID / 2);
  let cells = '';
  for (let x = 0; x < half; x++) {
    for (let y = 0; y < IDENT_GRID; y++) {
      if (!bit()) continue;
      cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
      const mx = IDENT_GRID - 1 - x;
      if (mx !== x) cells += `<rect x="${mx}" y="${y}" width="1" height="1"/>`;
    }
  }
  return `<svg class="ident" viewBox="0 0 ${IDENT_GRID} ${IDENT_GRID}" width="${px}" height="${px}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect width="${IDENT_GRID}" height="${IDENT_GRID}" fill="${t.card}"/><g fill="${fill}">${cells}</g></svg>`;
}

/* ---------- slides ---------- */

function slide(inner, { title } = {}) {
  return `<section class="slide" ${title ? `data-title="${esc(title)}"` : ''}><div class="inner">${inner}</div></section>`;
}

function buildSlides(s, t, meta) {
  const slides = [];
  const range = rangeLabel(s);

  // 1 — cover
  slides.push(slide(`
    <div class="kicker rv" style="--d:.05s">${meta.year ? `YOUR ${esc(meta.year)} IN CODE` : 'YOUR YEAR IN CODE'}</div>
    <h1 class="rv" style="--d:.15s"><span class="grad">${esc(meta.repo)}</span></h1>
    <p class="sub rv" style="--d:.3s">${esc(range)} · ${fmt(s.total)} commits · ${s.authors.length === 1 ? 'one author' : `${s.authors.length} authors`}</p>
    <p class="hintline rv" style="--d:.45s">This story was generated 100% locally. No account, no upload, no tracking.</p>
  `, { title: 'Cover' }));

  // 2 — total commits
  slides.push(slide(`
    <div class="kicker rv" style="--d:.05s">CHAPTER 01 · THE NUMBERS</div>
    <div class="stat-big grad rv" style="--d:.15s" data-cu="${s.total}">0</div>
    <p class="headline-sm rv" style="--d:.3s">commits shipped</p>
    <div class="cards rv" style="--d:.45s">
      <div class="mini"><b>${fmt(s.activeDays)}</b><span>active days</span></div>
      <div class="mini"><b>${s.avgPerDay.toFixed(1)}</b><span>avg / active day</span></div>
      <div class="mini"><b>+${fmt(s.ins)}</b><span>lines added</span></div>
      <div class="mini"><b>−${fmt(s.del)}</b><span>lines deleted</span></div>
    </div>
    ${s.firstCommit ? `<p class="quote rv" style="--d:.6s">It all started on <b>${esc(s.firstCommit.date)}</b>:<br>“${esc(s.firstCommit.subject.slice(0, 90))}”</p>` : ''}
  `, { title: 'Total commits' }));

  // 3 — heatmap
  slides.push(slide(`
    <div class="kicker rv" style="--d:.05s">CHAPTER 02 · THE GRIND</div>
    <h2 class="rv" style="--d:.15s">Every day you <span class="grad">showed up</span></h2>
    <div class="chart rv" style="--d:.3s">${heatmapSvg(s, t)}</div>
    <p class="sub rv" style="--d:.45s">Busiest day: <b>${esc(s.busiestDay ? s.busiestDay.date : '—')}</b> with <b>${fmt(s.busiestDay?.count || 0)}</b> commits</p>
  `, { title: 'Heatmap' }));

  // 4 — power hours
  slides.push(slide(`
    <div class="kicker rv" style="--d:.05s">CHAPTER 03 · THE CLOCK</div>
    <h2 class="rv" style="--d:.15s">Your <span class="grad">power hours</span></h2>
    <div class="clock-flex">
      <div class="rv" style="--d:.3s">${clockSvg(s, t)}</div>
      <div class="clock-side">
        <div class="fact rv" style="--d:.45s"><b>${hourLabel(s.hourCounts.indexOf(Math.max(...s.hourCounts)))}</b><span>is when you commit most</span></div>
        <div class="fact rv" style="--d:.55s"><b>${Math.round(s.weekendPct)}%</b><span>of commits landed on weekends</span></div>
        <div class="fact rv" style="--d:.65s"><b>${esc(WD[s.weekdayCounts.indexOf(Math.max(...s.weekdayCounts))])}</b><span>was your weekday of choice</span></div>
      </div>
    </div>
  `, { title: 'Power hours' }));

  // 5 — languages
  if (s.langs.length) {
    slides.push(slide(`
      <div class="kicker rv" style="--d:.05s">CHAPTER 04 · THE STACK</div>
      <h2 class="rv" style="--d:.15s">Your languages, <span class="grad">ranked</span></h2>
      <div class="chart rv" style="--d:.3s">${donutSvg(s, t)}</div>
    `, { title: 'Languages' }));
  }

  // 6 — ride or die file
  if (s.files.length) {
    const maxChurn = s.files[0].churn || 1;
    const rows = s.files.map((f, i) => `
      <div class="bar-row rv" style="--d:${0.25 + i * 0.1}s">
        <span class="bar-label">${esc(shortPath(f.path))}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.max(8, (f.churn / maxChurn) * 100)}%;background:linear-gradient(90deg,${t.b1},${t.a1})"></span></span>
        <span class="bar-val">+${fmt(f.ins)} / −${fmt(f.del)}</span>
      </div>`).join('');
    slides.push(slide(`
      <div class="kicker rv" style="--d:.05s">CHAPTER 05 · THE SCENE</div>
      <h2 class="rv" style="--d:.15s">Your <span class="grad">ride-or-die</span> files</h2>
      <div class="bars">${rows}</div>
      <p class="quote rv" style="--d:.7s">You touched <b>${esc(shortPath(s.files[0].path))}</b> more than anything else.<br>That's not a file anymore. That's a relationship.</p>
    `, { title: 'Top files' }));
  }

  // 7 — lingo
  {
    const maxV = s.topVerbs[0]?.n || 1;
    const verbs = s.topVerbs.map((v, i) => `
      <div class="bar-row rv" style="--d:${0.2 + i * 0.08}s">
        <span class="bar-label mono">"${esc(v.word)}"</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.max(6, (v.n / maxV) * 100)}%;background:linear-gradient(90deg,${t.a1},${t.a2})"></span></span>
        <span class="bar-val">×${fmt(v.n)}</span>
      </div>`).join('');
    const chips = [
      s.lingo.wip ? `<span class="chip rv" style="--d:.5s">✍️ ${fmt(s.lingo.wip)} × “wip”</span>` : '',
      s.lingo.final ? `<span class="chip rv" style="--d:.56s">🏁 ${fmt(s.lingo.final)} × “final”</span>` : '',
      s.lingo.oops ? `<span class="chip rv" style="--d:.62s">🙈 ${fmt(s.lingo.oops)} × oops/typo</span>` : '',
      s.lingo.revert ? `<span class="chip rv" style="--d:.68s">↩️ ${fmt(s.lingo.revert)} × revert</span>` : '',
      s.lingo.emoji ? `<span class="chip rv" style="--d:.74s">✨ ${fmt(s.lingo.emoji)} commits with emoji</span>` : '',
      s.lingo.dot ? `<span class="chip rv" style="--d:.8s">💬 ${fmt(s.lingo.dot)} commits titled “.”</span>` : '',
    ].filter(Boolean).join('');
    slides.push(slide(`
      <div class="kicker rv" style="--d:.05s">CHAPTER 06 · THE LANGUAGE OF LOVE</div>
      <h2 class="rv" style="--d:.15s">How you <span class="grad">talk to git</span></h2>
      ${verbs ? `<div class="bars">${verbs}</div>` : ''}
      <div class="chips">${chips}</div>
      ${s.longestSubject ? `<p class="quote rv" style="--d:.85s">Longest commit message ever:<br>“${esc(s.longestSubject.slice(0, 110))}”</p>` : ''}
    `, { title: 'Commit lingo' }));
  }

  // 8 — night owls
  {
    const ghost = s.ghostCommits;
    slides.push(slide(`
      <div class="kicker rv" style="--d:.05s">CHAPTER 07 · THE GHOST HOURS</div>
      ${ghost > 0 ? `
        <div class="stat-big grad rv" style="--d:.15s" data-cu="${ghost}">0</div>
        <p class="headline-sm rv" style="--d:.3s">commits between midnight and 5am</p>
        <p class="sub rv" style="--d:.45s">Your most haunted hour: <b>${hourLabel(s.ghostHour)}</b>. ${ghost >= 20 ? 'The commit graph never sleeps. Neither do you.' : 'Even the moon has a branch limit. Respect.'}</p>`
        : `
        <div class="stat-big grad rv" style="--d:.15s">☀️</div>
        <p class="headline-sm rv" style="--d:.3s">Sunlight certified</p>
        <p class="sub rv" style="--d:.45s">Not a single commit between midnight and 5am. Your circadian rhythm is in production.</p>`}
    `, { title: 'Ghost hours' }));
  }

  // 9 — team
  if (s.authors.length > 1) {
    const top = s.authors.slice(0, 3);
    const maxA = top[0].commits || 1;
    const medals = ['🥇', '🥈', '🥉'];
    const usedInk = new Set();
    const rows = top.map((a, i) => `
      <div class="bar-row rv" style="--d:${0.25 + i * 0.12}s">
        <span class="bar-label who">${identiconSvg(a.email || a.name, t, usedInk)}<span class="who-name">${medals[i]} ${esc(a.name)}</span></span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.max(10, (a.commits / maxA) * 100)}%;background:linear-gradient(90deg,${t.b2},${t.b1})"></span></span>
        <span class="bar-val">${fmt(a.commits)} commits</span>
      </div>`).join('');
    slides.push(slide(`
      <div class="kicker rv" style="--d:.05s">CHAPTER 08 · THE CREW</div>
      <h2 class="rv" style="--d:.15s">It took a <span class="grad">village</span></h2>
      <div class="bars">${rows}</div>
      <p class="sub rv" style="--d:.7s">${s.authors.length} humans pushed this repo forward. Highlight <b>${esc(top[0].name)}</b> at the next standup.</p>
    `, { title: 'The crew' }));
  }

  // 10 — verdict
  const v = s.verdict;
  slides.push(slide(`
    <div class="kicker rv" style="--d:.05s">FINAL CHAPTER · THE VERDICT</div>
    <div class="verdict-card rv" style="--d:.2s">
      <div class="verdict-emoji">${v.emoji}</div>
      <div class="verdict-title grad">${esc(v.title)}</div>
      <p class="verdict-blurb">${esc(v.blurb)}</p>
      <div class="chips">
        <span class="chip">📦 ${fmt(s.total)} commits</span>
        <span class="chip">🔥 ${s.longestStreak}-day streak</span>
        <span class="chip">🌙 ${Math.round(s.nightPct)}% after 10pm</span>
      </div>
    </div>
  `, { title: 'Verdict' }));

  // 11 — outro
  slides.push(slide(`
    <div class="kicker rv" style="--d:.05s">THAT'S A WRAP</div>
    <h2 class="rv" style="--d:.15s">Your code deserves a<br><span class="grad">standing ovation</span> 👏</h2>
    <div class="cta rv" style="--d:.35s">
      <div class="mono">npx git-recap</div>
    </div>
    <p class="hintline rv" style="--d:.5s">Run it in any repo · Works offline · Nothing leaves your machine</p>
    <p class="hintline rv" style="--d:.6s">⭐ Star it · 🍴 Fork it · Put <span class="mono">recap.svg</span> in your README</p>
  `, { title: 'Outro' }));

  return slides;
}

/* ---------- page shell ---------- */

function css(t) {
  return `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    background: radial-gradient(1100px 700px at 15% -10%, ${t.bg2}, ${t.bg} 60%) fixed, ${t.bg};
    color: ${t.text};
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }
  .mono { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
  .grad {
    background: linear-gradient(100deg, ${t.a1} 10%, ${t.a2} 90%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  /* chrome */
  .topbar { position: fixed; inset: 0 0 auto 0; z-index: 30; display: flex; align-items: center; justify-content: space-between; padding: 18px 26px; }
  .wordmark { font-weight: 800; font-size: 17px; letter-spacing: -0.02em; }
  .actions { display: flex; gap: 10px; }
  .btn {
    border: 1px solid ${t.border}; background: ${t.card}; color: ${t.text};
    padding: 9px 16px; border-radius: 999px; font-size: 13.5px; font-weight: 600; cursor: pointer;
    backdrop-filter: blur(8px); transition: transform .15s ease, border-color .15s ease;
  }
  .btn:hover { transform: translateY(-1px); border-color: ${t.a1}; }
  .progress { position: fixed; top: 0; left: 0; height: 4px; width: 0%; z-index: 40;
    background: linear-gradient(90deg, ${t.a1}, ${t.a2}, ${t.b2}); transition: width .45s cubic-bezier(.3,.7,.2,1); }
  .bottombar { position: fixed; inset: auto 0 0 0; z-index: 30; display: flex; align-items: center; justify-content: space-between; padding: 18px 26px; }
  .dots { display: flex; gap: 7px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: ${t.border}; cursor: pointer; transition: all .25s ease; }
  .dot.on { background: ${t.a1}; transform: scale(1.35); }
  .counter { font-size: 13px; color: ${t.faint}; font-variant-numeric: tabular-nums; }
  .navbtns { display: flex; gap: 8px; }
  .navbtn { width: 42px; height: 42px; border-radius: 50%; border: 1px solid ${t.border}; background: ${t.card}; color: ${t.text}; font-size: 17px; cursor: pointer; transition: transform .15s ease; }
  .navbtn:hover { transform: scale(1.08); }
  /* slides */
  .stage { position: fixed; inset: 0; }
  .slide {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    opacity: 0; transform: translateY(30px) scale(.985); pointer-events: none;
    transition: opacity .55s ease, transform .55s cubic-bezier(.2,.7,.2,1);
  }
  .slide.active { opacity: 1; transform: none; pointer-events: auto; }
  .inner { width: min(920px, 92vw); max-height: 82vh; overflow: hidden auto; text-align: center; padding: 70px 0 40px; scrollbar-width: none; }
  .inner::-webkit-scrollbar { display: none; }
  .kicker { font-size: 12.5px; font-weight: 700; letter-spacing: .32em; color: ${t.faint}; margin-bottom: 26px; }
  h1 { font-size: clamp(46px, 9vw, 104px); line-height: 1.02; letter-spacing: -0.03em; font-weight: 800; word-break: break-word; }
  h2 { font-size: clamp(32px, 5.4vw, 58px); line-height: 1.08; letter-spacing: -0.02em; font-weight: 800; margin-bottom: 30px; }
  .headline-sm { font-size: clamp(20px, 3vw, 30px); font-weight: 700; margin-top: 6px; }
  .sub { color: ${t.muted}; font-size: clamp(15px, 2vw, 19px); line-height: 1.65; margin-top: 22px; }
  .hintline { color: ${t.faint}; font-size: 14px; margin-top: 14px; }
  .quote { color: ${t.muted}; font-size: 16px; line-height: 1.7; margin-top: 34px; font-style: italic; }
  .quote b { color: ${t.text}; font-style: normal; }
  .stat-big { font-size: clamp(90px, 20vw, 210px); font-weight: 800; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }
  .cards { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin-top: 34px; }
  .mini { background: ${t.card}; border: 1px solid ${t.border}; border-radius: 18px; padding: 16px 26px; min-width: 150px; }
  .mini b { display: block; font-size: 30px; font-weight: 800; letter-spacing: -0.02em; }
  .mini span { color: ${t.faint}; font-size: 12.5px; letter-spacing: .06em; text-transform: uppercase; font-weight: 600; }
  .chart { display: flex; justify-content: center; margin-top: 6px; }
  .clock-flex { display: flex; gap: 44px; align-items: center; justify-content: center; flex-wrap: wrap; }
  .clock-side { text-align: left; display: flex; flex-direction: column; gap: 18px; max-width: 300px; }
  .fact { background: ${t.card}; border: 1px solid ${t.border}; border-radius: 18px; padding: 16px 22px; }
  .fact b { display: block; font-size: 26px; font-weight: 800; }
  .fact span { color: ${t.faint}; font-size: 13.5px; }
  .donut-wrap { display: flex; gap: 40px; align-items: center; justify-content: center; flex-wrap: wrap; }
  .legend { display: flex; flex-direction: column; gap: 13px; text-align: left; min-width: 220px; }
  .lg-row { display: flex; align-items: center; gap: 12px; font-size: 17px; font-weight: 600; }
  .lg-dot { width: 13px; height: 13px; border-radius: 4px; }
  .lg-name { flex: 1; }
  .lg-pct { color: ${t.faint}; font-variant-numeric: tabular-nums; }
  .bars { display: flex; flex-direction: column; gap: 16px; margin-top: 10px; }
  .bar-row { display: grid; grid-template-columns: minmax(120px, 240px) 1fr minmax(90px, auto); gap: 16px; align-items: center; text-align: left; }
  .bar-label { font-size: 14.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .who { display: flex; align-items: center; gap: 9px; overflow: visible; }
  .who-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ident { flex: none; border-radius: 5px; border: 1px solid ${t.border}; }
  .bar-track { height: 14px; border-radius: 999px; background: ${t.card}; overflow: hidden; }
  .bar-fill { display: block; height: 100%; border-radius: 999px; }
  .bar-val { font-size: 13px; color: ${t.faint}; font-variant-numeric: tabular-nums; text-align: right; }
  .chips { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 26px; }
  .chip { background: ${t.card}; border: 1px solid ${t.border}; padding: 9px 16px; border-radius: 999px; font-size: 14px; font-weight: 600; }
  .verdict-card {
    margin: 10px auto 0; max-width: 640px; padding: 44px 40px; border-radius: 30px;
    background: ${t.card}; border: 1.5px solid ${t.border};
    box-shadow: 0 30px 90px -30px ${t.blobs[0]}66;
  }
  .verdict-emoji { font-size: 58px; }
  .verdict-title { font-size: clamp(34px, 6vw, 56px); font-weight: 800; letter-spacing: -0.02em; margin: 12px 0 14px; }
  .verdict-blurb { color: ${t.muted}; font-size: clamp(15px, 2vw, 18px); line-height: 1.65; }
  .cta { display: inline-block; margin-top: 30px; padding: 18px 34px; border-radius: 20px; background: ${t.card}; border: 1.5px solid ${t.a1}; font-size: clamp(17px, 3vw, 24px); font-weight: 700; }
  /* reveals */
  .rv { opacity: 0; }
  .slide.active .rv { animation: rvIn .7s cubic-bezier(.2,.7,.25,1) forwards; animation-delay: var(--d, 0s); }
  @keyframes rvIn { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }
  #confetti { position: fixed; inset: 0; z-index: 20; pointer-events: none; }
  @media (max-width: 640px) {
    .clock-side { max-width: none; }
    .bar-row { grid-template-columns: 1fr; gap: 6px; }
    .bar-val { text-align: left; }
    .verdict-card { padding: 30px 22px; }
  }`;
}

function pageJs(t, cardSvg, seed) {
  return `
  (() => {
    const slides = [...document.querySelectorAll('.slide')];
    const dotsBox = document.querySelector('.dots');
    const counter = document.querySelector('.counter');
    const progress = document.querySelector('.progress');
    let idx = 0;
    slides.forEach((_, i) => {
      const d = document.createElement('button');
      d.className = 'dot'; d.setAttribute('aria-label', 'slide ' + (i + 1));
      d.onclick = () => go(i);
      dotsBox.appendChild(d);
    });
    const dots = [...dotsBox.children];
    function paint() {
      slides.forEach((s, i) => s.classList.toggle('active', i === idx));
      dots.forEach((d, i) => d.classList.toggle('on', i === idx));
      counter.textContent = (idx + 1) + ' / ' + slides.length;
      progress.style.width = ((idx + 1) / slides.length * 100) + '%';
      runCounters(slides[idx]);
      if (slides[idx].dataset.title === 'Verdict') confetti();
    }
    function go(i) { idx = Math.max(0, Math.min(slides.length - 1, i)); paint(); }
    const next = () => go(idx + 1), prev = () => go(idx - 1);
    document.querySelector('#nxt').onclick = next;
    document.querySelector('#prv').onclick = prev;
    addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
      if (e.key === 'Home') go(0);
      if (e.key === 'End') go(slides.length - 1);
    });
    let touchX = null;
    addEventListener('touchstart', (e) => touchX = e.touches[0].clientX, { passive: true });
    addEventListener('touchend', (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 60) (dx < 0 ? next() : prev());
      touchX = null;
    }, { passive: true });

    function runCounters(slide) {
      slide.querySelectorAll('[data-cu]').forEach((el) => {
        const target = Number(el.dataset.cu); const t0 = performance.now(); const dur = 1000;
        const step = (now) => {
          const p = Math.min(1, (now - t0) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased).toLocaleString('en-US');
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }

    /* confetti */
    const canvas = document.querySelector('#confetti');
    const ctx = canvas.getContext('2d');
    const COLORS = ${JSON.stringify([t.a1, t.a2, t.b1, t.b2])};
    /* mulberry32, reseeded per burst so a replay looks the same as the first run */
    let cs = 0;
    const crnd = () => {
      cs |= 0; cs = (cs + 0x6d2b79f5) | 0;
      let t = Math.imul(cs ^ (cs >>> 15), 1 | cs);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    function burst() {
      cs = ${seed};
      canvas.width = innerWidth; canvas.height = innerHeight;
      const parts = [];
      for (let i = 0; i < 140; i++) parts.push({
        x: crnd() * canvas.width, y: -20 - crnd() * canvas.height * 0.4,
        w: 6 + crnd() * 7, h: 9 + crnd() * 9,
        vy: 2.4 + crnd() * 3.4, vx: -1.4 + crnd() * 2.8,
        rot: crnd() * Math.PI, vr: -0.12 + crnd() * 0.24,
        c: COLORS[i % COLORS.length],
      });
      const t0 = performance.now();
      (function frame(now) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const p of parts) {
          p.x += p.vx; p.y += p.vy; p.rot += p.vr;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }
        if (now - t0 < 4200) requestAnimationFrame(frame);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
      })(t0);
    }
    let lastConfetti = 0;
    function confetti() { if (Date.now() - lastConfetti > 5000) { lastConfetti = Date.now(); burst(); } }

    /* save share card as PNG */
    const CARD = ${JSON.stringify(cardSvg)};
    document.querySelector('#save').onclick = async () => {
      const blob = new Blob([CARD], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 2400; c.height = 1260;
        const cx = c.getContext('2d');
        cx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(b);
          a.download = 'git-recap-card.png';
          a.click();
        }, 'image/png');
      };
      img.src = url;
    };

    paint();
  })();`;
}

export function buildHtml(s, theme, meta) {
  const cardSvg = buildCardSvg(s, theme, { repo: meta.repo, range: rangeLabel(s) });
  const slides = buildSlides(s, theme, meta);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.repo)} — git-recap</title>
<meta name="description" content="Spotify Wrapped for your git history. Generated locally by git-recap.">
<style>${css(theme)}</style>
</head>
<body>
  <div class="progress"></div>
  <header class="topbar">
    <span class="wordmark">git<span class="grad">-recap</span></span>
    <div class="actions">
      <button class="btn" id="save">⬇ Save share card</button>
      <button class="btn" onclick="location.reload()">↻ Replay</button>
    </div>
  </header>
  <main class="stage">${slides.join('\n')}</main>
  <canvas id="confetti"></canvas>
  <footer class="bottombar">
    <span class="counter"></span>
    <div class="dots"></div>
    <div class="navbtns">
      <button class="navbtn" id="prv" aria-label="previous">←</button>
      <button class="navbtn" id="nxt" aria-label="next">→</button>
    </div>
  </footer>
<script>${pageJs(theme, cardSvg, confettiSeed(s))}</script>
</body>
</html>
`;
}
