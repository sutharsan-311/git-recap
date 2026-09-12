// The shareable card. Used for recap.svg (README embed / social preview),
// recap-story.svg (portrait, for phone feeds) and the deck's "Save PNG" button.
//
// The look is borrowed from the products that invented this format rather than
// from other GitHub tools. Spotify Wrapped, Duolingo's year in review and
// Discord's Checkpoint are all flat, loud colour with printed-looking ornament:
// checkerboards, halftone dots, one enormous numeral. None of them glow. Dark
// backgrounds with neon bloom is a dev-tool convention, and it is exactly why
// dev-tool cards look cheap parked next to a real Wrapped card.
//
// The colour is the verdict. Duolingo's night owl is navy and its early bird is
// purple, so four cards in a row read as four different things at a glance —
// which is the whole job when these are seen small, in a feed, next to someone
// else's. Two git-recap cards should never look like the same template.

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

const FONT = `system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',sans-serif`;

// One palette per verdict key, plus a fallback for anything unrecognised.
// bg carries the mood, ink is what stays readable on it, accent is reserved for
// the one giant number. Contrast was checked against the ink on every bg.
const PALETTES = {
  night:   { bg: '#171A6B', ink: '#F3F0E6', accent: '#FFD166' },
  early:   { bg: '#FF7A45', ink: '#2A1204', accent: '#FFFFFF' },
  weekend: { bg: '#0F8A5F', ink: '#F1F8EF', accent: '#FFE45E' },
  fix:     { bg: '#D92D20', ink: '#FFF2E8', accent: '#FFD43B' },
  docs:    { bg: '#1F6FEB', ink: '#EFF6FF', accent: '#FFCB47' },
  wip:     { bg: '#8B45E8', ink: '#F7EFFF', accent: '#F7E463' },
  streak:  { bg: '#0A7D8C', ink: '#E9FBFF', accent: '#FFB347' },
  solo:    { bg: '#242424', ink: '#F5F5F0', accent: '#FF6B35' },
  force:   { bg: '#EFC03B', ink: '#1A1508', accent: '#D92D20' },
};
const DEFAULT_PALETTE = PALETTES.solo;

// Mid-cycle keyframes only, never a `from` or `0%`. An <img>-loaded SVG sampled
// at t=0 renders the first keyframe, and preview scrapers, thumbnailers and
// headless screenshots all sample at t=0. Keeping the element's ordinary style
// as its t=0 state means every possible capture is a good one.
const ANIM = `
    @keyframes gr-nudge { 50% { transform: translate(5px, 5px); } }
    @keyframes gr-fade  { 50% { opacity: .45; } }
    @keyframes gr-slide { 50% { transform: translateX(-36px); } }
    .nudge { animation: gr-nudge 9s ease-in-out infinite; }
    .cell  { animation: gr-fade 6s ease-in-out infinite; }
    .strip { animation: gr-slide 24s linear infinite; }
    @media (prefers-reduced-motion: reduce) {
      .nudge, .cell, .strip { animation: none; }
    }`;

function wrapText(text, maxChars) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (line && (line + ' ' + word).length > maxChars) { lines.push(line); line = word; }
    else line = line ? line + ' ' + word : word;
  }
  if (line) lines.push(line);
  return lines;
}

// The last `cols` weeks of daily commit counts, ending on the final commit.
// Returned column-major (one entry per day, 7 per column) so it draws directly.
function heatCells(s, cols) {
  if (!s.lastCommit) return [];
  const end = new Date(s.lastCommit.date.slice(0, 10) + 'T00:00:00Z');
  const cells = [];
  for (let i = cols * 7 - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    cells.push(s.dailyCounts[d.toISOString().slice(0, 10)] || 0);
  }
  return cells;
}

/* ---------- pieces, each drawn from a top-left origin ---------- */

const text = (x, y, str, { size = 16, weight = 600, fill, anchor = 'start', spacing = 0, opacity = 1 }) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}"${
    anchor === 'start' ? '' : ` text-anchor="${anchor}"`}${spacing ? ` letter-spacing="${spacing}"` : ''}${
    opacity === 1 ? '' : ` opacity="${opacity}"`}>${esc(str)}</text>`;

// The one piece of decoration that carries the whole "printed" feel.
const checkerStrip = (x, y, w, h, fill) => `
  <g clip-path="url(#stripClip)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none"/>
    <g class="strip">
      ${Array.from({ length: Math.ceil(w / 18) + 3 }, (_, i) =>
        `<rect x="${x + i * 18}" y="${y}" width="9" height="${h}" fill="${fill}"/>`).join('')}
    </g>
  </g>`;

// Your year as a block of squares. Every product in this genre leads with this
// shape because it is the one graphic that says "commits" without a label.
function heatBlock(s, x, y, { cols, cell, gap, ink, accent }) {
  const cells = heatCells(s, cols);
  if (!cells.length) return '';
  const max = Math.max(...cells, 1);
  let out = '';
  cells.forEach((c, i) => {
    const col = Math.floor(i / 7), row = i % 7;
    const cx = x + col * (cell + gap), cy = y + row * (cell + gap);
    // Four flat steps, not a gradient: this has to survive being screenshotted,
    // re-compressed and looked at on a phone.
    const step = c === 0 ? 0 : c / max > .66 ? 3 : c / max > .33 ? 2 : 1;
    const fill = step === 3 ? accent : ink;
    const op = [0.14, 0.4, 0.7, 1][step];
    const cls = step === 3 ? ' class="cell" style="animation-delay:' + ((i % 11) * .4).toFixed(1) + 's"' : '';
    out += `<rect${cls} x="${cx}" y="${cy}" width="${cell}" height="${cell}" rx="1.5" fill="${fill}" opacity="${op}"/>`;
  });
  return out;
}

// A number big enough to be the artwork, with the hard offset shadow that makes
// it read as print rather than as a stat.
const hugeNumber = (x, y, value, { size, ink, accent, anchor = 'start' }) => `
  <g>
    <text class="nudge" x="${x + 7}" y="${y + 7}" font-family="${FONT}" font-size="${size}" font-weight="800"
      letter-spacing="-${(size * 0.045).toFixed(1)}" fill="${ink}" opacity=".25"${anchor === 'start' ? '' : ` text-anchor="${anchor}"`}>${esc(value)}</text>
    <text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="800"
      letter-spacing="-${(size * 0.045).toFixed(1)}" fill="${accent}"${anchor === 'start' ? '' : ` text-anchor="${anchor}"`}>${esc(value)}</text>
  </g>`;

// Rare / Epic / Legendary, the way Reddit Recap tiers its persona cards. Ours is
// computed, not invented: it is how many times the typical rate this repo hit on
// the signal that won. The multiplier is printed next to it so the claim is
// checkable instead of being a mystery badge.
function tierOf(verdict) {
  const x = verdict.score;
  if (!x || !isFinite(x)) return null;
  const label = x >= 4 ? 'LEGENDARY' : x >= 2.5 ? 'EPIC' : x >= 1.6 ? 'RARE' : 'UNCOMMON';
  return { label, mult: `${x.toFixed(1)}× typical` };
}

const tierBadge = (x, y, tier, { ink, bg, anchor = 'end' }) => {
  if (!tier) return '';
  const w = 8.4 * tier.label.length + 34;
  const left = anchor === 'end' ? x - w : x;
  return `
  <g>
    <rect x="${left}" y="${y}" width="${w}" height="30" rx="15" fill="${ink}"/>
    ${text(left + w / 2, y + 20, tier.label, { size: 12.5, weight: 800, fill: bg, anchor: 'middle', spacing: 1.6 })}
    ${text(left + w / 2, y + 48, tier.mult, { size: 12, weight: 600, fill: ink, anchor: 'middle', opacity: .75 })}
  </g>`;
};

/* ---------- the two layouts ---------- */

export function buildCardSvg(s, theme, { repo, range, portrait = false } = {}) {
  const v = s.verdict || {};
  const p = PALETTES[v.key] || DEFAULT_PALETTE;
  const topLang = s.langs && s.langs[0] ? s.langs[0].name : null;
  // "of lines written", never "of code written": the share counts .md/.json/.yaml
  // too, and calling a Markdown-heavy repo's total "code" overclaims.
  const langShare = s.langs && s.langs[0] && s.langs[0].share != null
    ? `${topLang} · ${Math.round(s.langs[0].share * 100)}% of lines written` : topLang;
  const W = portrait ? 1080 : 1200;
  const H = portrait ? 1350 : 630;

  const titleLines = wrapText(v.title || 'Your year in code', portrait ? 15 : 13);
  const blurbLines = wrapText(v.blurb || '', portrait ? 46 : 44).slice(0, 3);
  const facts = [repo, range, s.longestStreak && `${s.longestStreak}-day streak`]
    .filter(Boolean).join('  ·  ');

  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="git-recap card for ${esc(repo || 'repository')}">
  <defs>
    <style>${ANIM}</style>
    <clipPath id="stripClip"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath>
    <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="3" r="2.1" fill="${p.ink}" opacity=".22"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="${p.bg}"/>`;

  const foot = `</svg>\n`;

  if (portrait) {
    const titleSize = titleLines.length > 2 ? 78 : 92;
    // Everything below the blurb is anchored off the title's real height rather
    // than a fixed y, or a three-line verdict name shoves the number off the card.
    const blurbTop = 335 + titleLines.length * (titleSize * 0.94) + 40;
    return head + `
  ${checkerStrip(-40, 0, W + 80, 26, p.ink)}
  <rect x="0" y="${H - 250}" width="${W}" height="250" fill="url(#dots)"/>

  ${text(72, 106, 'git-recap', { size: 26, weight: 800, fill: p.ink })}
  ${tierBadge(W - 72, 82, tierOf(v), { ink: p.ink, bg: p.bg })}

  ${text(72, 205, v.emoji || '', { size: 118, fill: p.ink })}
  ${titleLines.map((l, i) => text(72, 335 + i * (titleSize * 0.94), l, { size: titleSize, weight: 800, fill: p.ink, spacing: -2.5 })).join('')}
  ${blurbLines.map((l, i) => text(72, blurbTop + i * 36, l, { size: 26, weight: 500, fill: p.ink, opacity: .78 })).join('')}

  ${hugeNumber(72, 880, fmt(s.total), { size: 210, ink: p.ink, accent: p.accent })}
  ${text(76, 922, 'COMMITS', { size: 20, weight: 800, fill: p.ink, spacing: 6, opacity: .7 })}
  ${text(W - 72, 880, fmt(s.activeDays), { size: 78, weight: 800, fill: p.ink, anchor: 'end' })}
  ${text(W - 72, 922, 'ACTIVE DAYS', { size: 18, weight: 800, fill: p.ink, spacing: 4, anchor: 'end', opacity: .7 })}

  ${heatBlock(s, 72, 982, { cols: 52, cell: 13, gap: 4, ink: p.ink, accent: p.accent })}
  ${langShare ? text(72, 1148, langShare, { size: 23, weight: 600, fill: p.ink, opacity: .75 }) : ''}

  ${text(72, 1245, facts, { size: 23, weight: 700, fill: p.ink, opacity: .85 })}
  ${text(72, 1295, 'make yours → npx git-recap', { size: 23, weight: 800, fill: p.accent })}
` + foot;
  }

  const titleSize = titleLines.length > 2 ? 58 : 68;
  return head + `
  ${checkerStrip(-40, 0, W + 80, 20, p.ink)}
  <rect x="${W - 430}" y="0" width="430" height="${H}" fill="url(#dots)" opacity=".55"/>

  ${text(64, 82, 'git-recap', { size: 21, weight: 800, fill: p.ink })}
  ${tierBadge(W - 64, 58, tierOf(v), { ink: p.ink, bg: p.bg })}

  ${text(64, 196, v.emoji || '', { size: 76, fill: p.ink })}
  ${titleLines.map((l, i) => text(64, 288 + i * (titleSize * 0.95), l, { size: titleSize, weight: 800, fill: p.ink, spacing: -1.8 })).join('')}
  ${blurbLines.map((l, i) => text(64, 316 + titleLines.length * (titleSize * 0.95) + i * 26, l, { size: 18, weight: 500, fill: p.ink, opacity: .78 })).join('')}

  ${text(64, 556, facts, { size: 16, weight: 700, fill: p.ink, opacity: .85 })}
  ${text(64, 590, 'make yours → npx git-recap', { size: 16, weight: 800, fill: p.accent })}

  ${hugeNumber(W - 64, 268, fmt(s.total), { size: 150, ink: p.ink, accent: p.accent, anchor: 'end' })}
  ${text(W - 64, 306, 'COMMITS', { size: 15, weight: 800, fill: p.ink, spacing: 5, anchor: 'end', opacity: .7 })}
  ${heatBlock(s, W - 64 - (52 * 7 - 2), 360, { cols: 52, cell: 5, gap: 2, ink: p.ink, accent: p.accent })}
  ${text(W - 64, 470, `${fmt(s.activeDays)} active days`, { size: 17, weight: 700, fill: p.ink, anchor: 'end', opacity: .8 })}
  ${langShare ? text(W - 64, 496, langShare, { size: 15, weight: 600, fill: p.ink, anchor: 'end', opacity: .7 }) : ''}
` + foot;
}
