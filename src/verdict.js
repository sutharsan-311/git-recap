// Deterministic personality engine: pick the verdict the repo is most *unusual* on.
//
// Every candidate scores as (this repo's rate) / (a typical repo's rate), so the
// signals are comparable to each other — a 60%-night repo (4x typical) beats a
// 30%-weekend repo (2x typical), and nothing wins just for having a big raw number.
// All seven values are shares bounded by 1.0. Anything at or below 1.0 is ordinary
// and doesn't get to be your personality.
//
import { utcDay } from './git.js';
// ponytail: baselines below are hand-set priors, not measured. If someone ever
// runs this over a corpus of real repos, replace them with the actual medians.
const TYPICAL = {
  night: 0.15,   // share of commits at 22:00–04:59
  early: 0.12,   // share before 09:00
  weekend: 0.15, // share on Sat/Sun
  fix: 0.20,     // share of subjects starting with "fix"
  docs: 0.06,    // share starting with "docs"
  wip: 0.02,     // share starting with "wip"
  streak: 0.03,  // share of the repo's committed lifespan covered by its longest
                 // daily streak. Development is bursty — a week or two of daily
                 // pushes, then quiet stretches — so a few percent is typical.
};

const FALLBACK = {
  solo: {
    key: 'solo',
    title: 'The One-Person Army',
    emoji: '🦾',
    blurb: (s) => `${s.total.toLocaleString('en-US')} commits, one set of hands. You are the team standup.`,
  },
  force: {
    key: 'force',
    title: 'The Full-Stack Force',
    emoji: '⚡',
    blurb: () => 'No habit stood out from the crowd — you committed in a fairly typical rhythm. That\'s most repos, and most repos ship.',
  },
};

export function pickVerdict(s) {
  // Streak is scored as a share of the repo's committed lifespan — the same
  // bounded 0..1 shape as the other signals. A raw day count grows with repo
  // age, so old steady repos used to win Marathoner forever; as a share, age
  // cancels out and only a streak covering an unusual slice of the repo's life
  // qualifies.
  const span = s.firstCommit && s.lastCommit
    ? utcDay(s.lastCommit.date) - utcDay(s.firstCommit.date) + 1
    : 0;
  const cands = [];
  const add = (key, value, title, emoji, blurb) => {
    // A rate estimated from too few commits is noise: 2 night commits out of 10
    // is not a personality. A signal may only win when its baseline predicts
    // ~5 events across the repo (total * baseline >= 5); smaller repos fall
    // through to the fallback instead of getting a verdict from noise.
    const score = value / TYPICAL[key];
    if (s.total * TYPICAL[key] >= 5 && score > 1) cands.push({ key, score, title, emoji, blurb });
  };

  add('night', s.nightPct / 100, 'The Midnight Architect', '🦉',
    `${Math.round(s.nightPct)}% of your commits shipped after 10pm. The best ideas don't sleep — and apparently, neither do you.`);
  add('early', s.earlyPct / 100, 'The Dawn Deployer', '🌅',
    `${Math.round(s.earlyPct)}% of your commits landed before 9am. The early bird gets the merge.`);
  add('weekend', s.weekendPct / 100, 'The Weekend Warrior', '⚔️',
    `${Math.round(s.weekendPct)}% of your work happened on Saturdays and Sundays. Rest is just a merge conflict you refuse to accept.`);
  add('fix', s.fixPct / 100, 'The Firefighter', '🔥',
    `${s.lingo.fix} commits started with “fix”. You don't write bugs — you wrestle them into submission.`);
  add('docs', s.docsPct / 100, 'The Cartographer', '🗺️',
    `${s.lingo.docs} documentation commits. Code fades, but the docs you wrote will guide strangers for years.`);
  add('wip', s.lingo.wip / Math.max(s.total, 1), 'The Eternal Draft', '✍️',
    `${s.lingo.wip} commits literally titled “wip”. Somewhere, a future you is screaming — lovingly.`);
  add('streak', span ? s.longestStreak / span : 0, 'The Marathoner', '🏃',
    `${s.longestStreak} consecutive days of commits. Momentum isn't a habit for you — it's a personality.`);

  cands.sort((a, b) => b.score - a.score);
  if (cands[0]) return { ...cands[0], score: undefined };

  // Nothing stood out. Fall back to the shape of the repo itself — most repos are
  // solo, so "solo" is a description, never an achievement worth ranking.
  const f = s.authors.length === 1 && s.total >= 100 ? FALLBACK.solo : FALLBACK.force;
  return { key: f.key, title: f.title, emoji: f.emoji, blurb: f.blurb(s) };
}
