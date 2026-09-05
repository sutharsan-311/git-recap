import { spawnSync } from 'node:child_process';
import { langOf } from './langs.js';

const SEP = '\x01'; // record separator at each commit
const FMT = `%x01%H${'\x02'}%an${'\x03'}%ae${'\x04'}%aI${'\x05'}%s`;

function runGit(repo, args, maxBuffer = 1 << 29) {
  const res = spawnSync('git', ['-C', repo, '-c', 'core.quotepath=false', ...args], {
    encoding: 'utf8',
    maxBuffer,
  });
  if (res.error || res.status !== 0) {
    const msg = (res.stderr || res.error?.message || 'unknown error').toString().trim();
    throw new Error(`git ${args[0]} failed: ${msg}`);
  }
  return res.stdout;
}

// "path" | "{old => new}" | "old => new" -> the new path
function normalizeNumstatPath(p) {
  let s = p.trim();
  if (s.includes('=>')) {
    s = s.replace(/^\{(.*)\}$/, '$1');
    const idx = s.lastIndexOf('=>');
    s = s.slice(idx + 2).trim();
    s = s.replace(/^\{|\}$/g, '');
  }
  return s.replace(/^"|"$/g, '');
}

export function readLog(repo, { since, until, author } = {}) {
  const args = ['log', `--pretty=format:${FMT}`, '--numstat', '--no-color'];
  if (since) args.push(`--since=${since}`);
  if (until) args.push(`--until=${until}`);
  if (author) args.push(`--author=${author}`);
  const out = runGit(repo, args);
  return out;
}

export function parseLog(out) {
  const commits = [];
  if (!out) return commits;
  const records = out.split(SEP);
  for (const rec of records) {
    if (!rec) continue;
    const nl = rec.indexOf('\n');
    const header = nl === -1 ? rec : rec.slice(0, nl);
    const body = nl === -1 ? '' : rec.slice(nl + 1);
    const [hash, name, email, date, subject] = header.split(/[\x02\x03\x04\x05]/);
    if (!hash || !date) continue;
    const dateKey = date.slice(0, 10);
    const hour = Number(date.slice(11, 13));

    const files = [];
    if (body.trim()) {
      for (const line of body.split('\n')) {
        if (!line.trim()) continue;
        const m = line.match(/^(-|\d+)\t(-|\d+)\t(.*)$/);
        if (!m) continue;
        const path = normalizeNumstatPath(m[3]);
        files.push({
          path,
          ins: m[1] === '-' ? 0 : Number(m[1]),
          del: m[2] === '-' ? 0 : Number(m[2]),
          binary: m[1] === '-',
        });
      }
    }

    commits.push({
      hash,
      authorName: name || 'unknown',
      authorEmail: (email || 'unknown').toLowerCase(),
      dateKey,
      hour: Number.isFinite(hour) ? hour : 0,
      subject: subject || '',
      files,
    });
  }
  return commits;
}

export function mergeCount(repo, { since, until, author } = {}) {
  const args = ['rev-list', '--count', '--merges', 'HEAD'];
  if (since) args.push(`--since=${since}`);
  if (until) args.push(`--until=${until}`);
  if (author) args.push(`--author=${author}`);
  try {
    return Number(runGit(repo, args, 1 << 16).trim()) || 0;
  } catch {
    return 0;
  }
}

// Generated and vendored files are not languages you wrote. One `package-lock.json`
// bump is 5k lines of "JSON" and will happily take the top slot on your share card.
const LOCKFILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|composer\.lock|Cargo\.lock|Gemfile\.lock|poetry\.lock|Pipfile\.lock|go\.sum)$/;
const VENDORED = /(^|\/)(node_modules|bower_components|vendor|third_party|dist|build|\.next|out)\/|\.min\.(js|css)$|\.map$/;
const isGenerated = (p) => LOCKFILE.test(p) || VENDORED.test(p);

const utcDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

export function analyze(commits, { merges = 0 } = {}) {
  const daily = new Map();
  const hourCounts = new Array(24).fill(0);
  const weekdayCounts = new Array(7).fill(0);
  const monthCounts = new Map();
  const authors = new Map();
  const files = new Map();
  const langs = new Map();
  let ins = 0;
  let del = 0;

  let first = null;
  let last = null;

  const lingo = {
    wip: 0, final: 0, oops: 0, fix: 0, docs: 0, emoji: 0, dot: 0, revert: 0,
  };
  const verbs = new Map();
  let longestSubject = '';
  let shortestSubject = null;

  for (const c of commits) {
    daily.set(c.dateKey, (daily.get(c.dateKey) || 0) + 1);
    hourCounts[c.hour]++;
    weekdayCounts[new Date(utcDay(c.dateKey) * 86400000).getUTCDay()]++;
    monthCounts.set(c.dateKey.slice(0, 7), (monthCounts.get(c.dateKey.slice(0, 7)) || 0) + 1);

    const a = authors.get(c.authorEmail) || { name: c.authorName, email: c.authorEmail, commits: 0 };
    a.commits++;
    authors.set(c.authorEmail, a);

    if (!first || c.dateKey < first.dateKey) first = c;
    if (!last || c.dateKey > last.dateKey) last = c;

    const subj = c.subject.trim();
    if (subj.length > longestSubject.length) longestSubject = subj;
    if (subj && (!shortestSubject || subj.length < shortestSubject.length)) shortestSubject = subj;

    // strip a proper conventional-commit prefix ("fix:", "feat(ctx):") so it doesn't pollute the verb chart
    const bare = subj.toLowerCase().replace(/^\s*(feat|fix|bugfix|hotfix|chore|docs?|refactor|test|style|perf|build|ci)(\(|:)\s*/u, '');
    const firstWord = (bare.split(/[\s((]+/)[0] || '').replace(/[^a-z0-9']/g, '');
    if (firstWord && firstWord !== 'merge') {
      verbs.set(firstWord, (verbs.get(firstWord) || 0) + 1);
    }
    if (/^(fix|bugfix|hotfix|patch)\b/.test(subj.toLowerCase())) lingo.fix++;
    if (/^docs?\b/.test(subj.toLowerCase())) lingo.docs++;
    if (/^(wip|draft)\b/i.test(subj)) lingo.wip++;
    if (/\bfinal\b/i.test(subj)) lingo.final++;
    if (/\b(oops|typo|ugh|damn|whoops|oopsie)\b/i.test(subj)) lingo.oops++;
    if (/^revert\b/i.test(subj)) lingo.revert++;
    if (/\p{Extended_Pictographic}/u.test(subj)) lingo.emoji++;
    if (/^\.+$/.test(subj)) lingo.dot++;

    for (const f of c.files) {
      const entry = files.get(f.path) || { path: f.path, commits: 0, ins: 0, del: 0 };
      entry.commits++;
      entry.ins += f.ins;
      entry.del += f.del;
      files.set(f.path, entry);
      if (!f.binary) {
        ins += f.ins;
        del += f.del;
        const lang = isGenerated(f.path) ? null : langOf(f.path);
        if (lang) {
          const l = langs.get(lang.name) || { name: lang.name, color: lang.color, ins: 0, del: 0, files: new Set() };
          l.ins += f.ins;
          l.del += f.del;
          l.files.add(f.path);
          langs.set(lang.name, l);
        }
      }
    }
  }

  // streaks over sorted unique days
  const days = [...daily.keys()].sort();
  let longestStreak = 0;
  let streakRun = 0;
  let prev = null;
  for (const d of days) {
    streakRun = prev !== null && utcDay(d) - utcDay(prev) === 1 ? streakRun + 1 : 1;
    if (streakRun > longestStreak) longestStreak = streakRun;
    prev = d;
  }
  const lastDay = days[days.length - 1];
  const nowKey = new Date().toISOString().slice(0, 10);
  let currentStreak = 0;
  if (lastDay && utcDay(nowKey) - utcDay(lastDay) <= 1) {
    currentStreak = 1;
    for (let i = days.length - 1; i > 0; i--) {
      if (utcDay(days[i]) - utcDay(days[i - 1]) !== 1) break;
      currentStreak++;
    }
  }

  let busiestDay = null;
  for (const [k, v] of daily) if (!busiestDay || v > busiestDay.count) busiestDay = { date: k, count: v };
  let busiestMonth = null;
  for (const [k, v] of monthCounts) if (!busiestMonth || v > busiestMonth.count) busiestMonth = { month: k, count: v };

  const total = commits.length;
  const ghostCommits = hourCounts.slice(0, 5).reduce((a, b) => a + b, 0);
  const nightPct = total ? (hourCounts.filter((_, h) => h >= 22 || h <= 4).reduce((a, b) => a + b, 0) / total) * 100 : 0;
  const earlyPct = total ? (hourCounts.slice(5, 9).reduce((a, b) => a + b, 0) / total) * 100 : 0;
  const weekendPct = total ? ((weekdayCounts[0] + weekdayCounts[6]) / total) * 100 : 0;
  const fixPct = total ? (lingo.fix / total) * 100 : 0;
  const docsPct = total ? (lingo.docs / total) * 100 : 0;
  let ghostHour = 0;
  for (let h = 1; h < 5; h++) if (hourCounts[h] > hourCounts[ghostHour]) ghostHour = h;

  const topAuthors = [...authors.values()].sort((a, b) => b.commits - a.commits);
  const topFiles = [...files.values()]
    .map((f) => ({ ...f, churn: f.ins + f.del }))
    .sort((a, b) => b.churn - a.churn)
    .slice(0, 5);
  const topLangs = [...langs.values()].sort((a, b) => b.ins - a.ins);
  const langInsTotal = topLangs.reduce((s, l) => s + l.ins, 0);
  const topVerbs = [...verbs.entries()]
    .filter(([w, n]) => w.length > 1 && n > 1 && !['the', 'a', 'an', 'and', 'for', 'with', 'this', 'that', 'to', 'of', 'in', 'on', 'add', 'update', 'new'].includes(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const stats = {
    repo: null, // filled by caller
    total,
    merges,
    ins,
    del,
    activeDays: daily.size,
    firstCommit: first ? { date: first.dateKey, subject: first.subject } : null,
    lastCommit: last ? { date: last.dateKey, subject: last.subject } : null,
    dailyCounts: Object.fromEntries(daily),
    hourCounts,
    weekdayCounts,
    monthCounts: Object.fromEntries(monthCounts),
    authors: topAuthors,
    files: topFiles,
    langs: topLangs.map((l) => ({ name: l.name, color: l.color, ins: l.ins, files: l.files.size, share: langInsTotal ? l.ins / langInsTotal : 0 })),
    longestStreak,
    currentStreak,
    busiestDay,
    busiestMonth,
    ghostCommits,
    ghostHour,
    nightPct,
    earlyPct,
    weekendPct,
    fixPct,
    docsPct,
    lingo: { ...lingo },
    topVerbs: topVerbs.map(([word, n]) => ({ word, n })),
    longestSubject,
    shortestSubject: shortestSubject || '',
    avgPerDay: daily.size ? total / daily.size : 0,
  };
  return stats;
}
