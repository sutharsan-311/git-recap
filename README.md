<div align="center">

# 🎁 git-recap

### Spotify Wrapped, but for your git history.

**An animated, shareable story of your code — generated 100% locally in one command.**
No account. No API key. No upload. Zero dependencies.

[![npm](https://img.shields.io/npm/v/git-recap?color=ff6ec4&label=npx%20git-recap)](https://www.npmjs.com/package/git-recap)
[![zero deps](https://img.shields.io/badge/dependencies-0-8a7dff)](package.json)
[![license](https://img.shields.io/badge/license-MIT-ffc36e)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A516-4dd8ff)](package.json)

**`npx git-recap`** · run it in any repo · scroll through it

</div>

---

![git-recap demo](docs/demo.gif)

| The story (up to 11 slides) | Every day you showed up |
| --- | --- |
| ![story](docs/screenshots/story-cover.png) | ![heatmap](docs/screenshots/story-heatmap.png) |
| **Who did the work** | **The verdict** 👏 |
| ![crew](docs/screenshots/story-crew.png) | ![verdict](docs/screenshots/story-verdict.png) |

**And the share card** — generated as `recap.svg`, made to be embedded in your README. The colour is your verdict, so no two people get the same card:

![share card](example/recap.svg)

---

## Why this spreads

Wrapped-style recaps are the most shared format on the internet (Spotify proved it). Every card someone posts — in a README, a tweet, a standup slide — is an ad for the tool. `git-recap` is built around that loop:

1. **The story** — `recap.html`, a full-screen animated recap of any repo: your heatmap, power hours, language donut, ride-or-die files, commit lingo ("fix" ×321), 3AM commits, and a personality verdict with confetti.
2. **The card** — `recap.svg`, a 1200×630 digest. Perfect size for a README *and* for the repo's social preview image. This is the piece that self-propagates: every README it lands in markets the tool to everyone who visits.
3. **The end card** — the story ends with `npx git-recap`, so every share teaches the next person how to make their own.

## Quick start

```bash
cd your-project
npx git-recap
```

That's it. It writes to `./git-recap/`:

| File | What it is |
| --- | --- |
| `recap.html` | The animated story. Opens in your browser and scrolls like a page. |
| `recap.svg` | Share card for your README / social preview. Landscape, 1200×630. |
| `recap-story.svg` | The same card in portrait, sized for a phone feed. |
| `recap.json` | The raw stats — do whatever you want with them. |

## Options

```bash
npx git-recap [repo-path] [options]

--year 2025        # wrap a single year
--since / --until  # any git date range
--author "name"    # wrap one person's year
--theme synth      # night (default) · synth · forest
--out <dir>        # output elsewhere
--no-open          # don't launch the browser
--json             # stats to stdout, for scripts
```

### Put your year in your profile README (the viral bit)

```bash
npx git-recap ~/$YOUR_REPO --year 2025 --no-open
cp $YOUR_REPO/git-recap/recap.svg .
```

```markdown
![My year in code](./recap.svg)
```

### Auto-refresh it with GitHub Actions

```yaml
name: recap
on:
  schedule: [{ cron: "0 9 1 1 *" }]   # every Jan 1
  workflow_dispatch:
permissions: { contents: write }
jobs:
  wrap:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }        # full history
      - uses: actions/setup-node@v4
      - run: npx -y git-recap . --year $(date -d "last year" +%Y) --no-open --out .
      - run: |
          git config user.name "recap-bot" && git config user.email "bot@users.noreply.github.com"
          git add recap.svg && git commit -m "wrap: $(date -d 'last year' +%Y)" || exit 0
          git push
```

## What it computes

Everything from one `git log --numstat` pass over your history:

- **Commit volume**, active days, averages, +/− line counts
- **52-week heatmap**, longest streak, current streak, busiest day/month
- **Power-hour clock** (24-hour radial chart) and weekday rhythm
- **Language ranking** by lines written (60+ extensions recognized)
- **Ride-or-die files** by churn
- **Commit lingo** — top verbs, "wip" count, emoji commits, your longest message
- **Ghost hours** — commits between midnight and 5am
- **Your verdict** — one of 9 deterministic coding personalities

## Privacy

Everything runs on your machine with the `git` binary you already have. There is no server, no telemetry, no network call. It reads, it computes, it writes four files. Read the whole source — it's ~1,600 lines with zero dependencies.

## Contributing

PRs welcome — verdicts, themes, and languages are all data-driven tables, so adding one is a great first issue.

## License

[MIT](LICENSE) © 2026 sutharsan

<div align="center">
<sub>Built for the people who commit at 3am. 🦉</sub>
</div>
