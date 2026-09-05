// The shareable 1200x630 digest card. Used for wrapped.svg (README embed / social
// preview) and re-used inside the HTML deck for the "Save PNG" button.
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

// Ambient motion for the share card.
//
// Every keyframe here defines only mid-cycle steps (50%), never a `from`. That is
// deliberate: an <img>-loaded SVG sampled at t=0 renders the FIRST keyframe, and
// social-preview scrapers, thumbnailers and headless screenshots all sample at
// t=0. This card is 1200x630 -- Open Graph size -- so its whole job is to look
// right in exactly those still captures. A `from { opacity: 0 }` entrance would
// animate beautifully in a browser and hand every previewer a blank card.
// Mid-cycle-only keyframes make the element's ordinary style the t=0 state, so
// every possible sample is a good one and the motion is pure bonus.
const ANIM = {
  driftS: 19,     // blob drift; slow enough to read the card over
  pulseS: 7,      // tile value breathing
  staggerS: 0.55, // gap between tile pulses, so they ripple rather than blink together
  hueS: 14,       // travel across the wordmark gradient
};

export function buildCardSvg(s, theme, { repo, range } = {}) {
  const verdict = s.verdict;
  const topLang = s.langs[0]?.name || '—';
  const topLangShare = s.langs[0] ? Math.round(s.langs[0].share * 100) : 0;

  const tiles = [
    { label: 'COMMITS', value: fmt(s.total), color: theme.a1 },
    { label: 'TOP LANGUAGE', value: topLang, sub: topLangShare ? `${topLangShare}% of code written` : null, color: theme.b1 },
    { label: 'LONGEST STREAK', value: `${s.longestStreak}d`, color: theme.a2 },
    { label: '3AM COMMITS', value: fmt(s.ghostCommits), color: theme.b2 },
  ];

  const tileW = 246;
  const gap = 24;
  const startX = (1200 - (tileW * 4 + gap * 3)) / 2;

  const tilesSvg = tiles
    .map((t, i) => {
      const x = startX + i * (tileW + gap);
      return `
  <g>
    <rect x="${x}" y="188" width="${tileW}" height="128" rx="18" fill="${theme.card}" stroke="${theme.border}" stroke-width="1.5"/>
    <text x="${x + 20}" y="222" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="12" letter-spacing="2.5" font-weight="700" fill="${theme.faint}">${esc(t.label)}</text>
    <text class="pulse" style="animation-delay:${(i * ANIM.staggerS).toFixed(2)}s" x="${x + 20}" y="278" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="${t.value.length > 9 ? 30 : 40}" font-weight="800" fill="${t.color}">${esc(t.value)}</text>
    ${t.sub ? `<text x="${x + 20}" y="302" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="13" fill="${theme.faint}">${esc(t.sub)}</text>` : ''}
  </g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="git-wrapped card for ${esc(repo || 'repository')}">
  <defs>
    <style>
      /* mid-cycle keyframes only -- see ANIM above */
      @keyframes gw-drift  { 50% { transform: translate(28px, -20px) scale(1.07); } }
      @keyframes gw-drift2 { 50% { transform: translate(-32px, 16px) scale(1.06); } }
      @keyframes gw-pulse  { 50% { opacity: .62; } }
      @keyframes gw-hue    { 50% { stop-color: ${theme.b1}; } }
      .blob  { transform-box: fill-box; transform-origin: center; }
      .blob1 { animation: gw-drift ${ANIM.driftS}s ease-in-out infinite; }
      .blob2 { animation: gw-drift2 ${ANIM.driftS + 5}s ease-in-out infinite; }
      .pulse { animation: gw-pulse ${ANIM.pulseS}s ease-in-out infinite; }
      .hue   { animation: gw-hue ${ANIM.hueS}s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .blob1, .blob2, .pulse, .hue { animation: none; }
      }
    </style>
    <radialGradient id="blob1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${theme.blobs[0]}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${theme.blobs[0]}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="blob2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${theme.blobs[1]}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${theme.blobs[1]}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop class="hue" offset="0%" stop-color="${theme.a1}"/>
      <stop offset="100%" stop-color="${theme.a2}"/>
    </linearGradient>
    <linearGradient id="verdictGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${theme.a1}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${theme.b2}" stop-opacity="0.22"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="${theme.bg}"/>
  <circle class="blob blob1" cx="130" cy="40" r="330" fill="url(#blob1)"/>
  <circle class="blob blob2" cx="1120" cy="620" r="380" fill="url(#blob2)"/>

  <text x="64" y="76" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="22" font-weight="800" fill="${theme.text}">git<tspan fill="url(#titleGrad)">-wrapped</tspan></text>
  <text x="1136" y="76" text-anchor="end" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="${theme.faint}">${esc(range || '')}</text>

  <text x="64" y="150" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="42" font-weight="800" fill="${theme.text}">${esc(repo || 'your repository')}</text>

  ${tilesSvg}

  <g>
    <rect x="64" y="348" width="1072" height="180" rx="22" fill="url(#verdictGrad)" stroke="${theme.border}" stroke-width="1.5"/>
    <text x="96" y="396" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="13" letter-spacing="3" font-weight="700" fill="${theme.faint}">YOUR CODING PERSONALITY</text>
    <text x="96" y="452" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="44" font-weight="800" fill="${theme.text}">${esc(verdict.emoji)}  ${esc(verdict.title)}</text>
    <text x="96" y="496" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="16" fill="${theme.muted}">${esc(verdict.blurb).slice(0, 110)}</text>
  </g>

  <text x="64" y="580" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="700" fill="${theme.faint}">make yours → <tspan fill="${theme.a1}">npx git-wrapped</tspan></text>
</svg>
`;
}
