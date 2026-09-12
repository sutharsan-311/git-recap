# 🚀 Launch kit — how this reaches the front page

The product is the demo. The strategy is: **let people share themselves.** Here's the exact play.

## Before you launch (30 minutes)

1. ~~Replace `YOUR-NAME` with your GitHub username~~ — done, everything points at `sutharsan-311`.
2. Refresh the README stills whenever the demo repo changes: `npm run screenshots`
   (regenerates `docs/screenshots/*.png` from `example/recap.html` with headless Chrome).
3. Record a 15–30s demo: run `npx git-recap` in a real repo, arrow through the story, land on the verdict with confetti. Use a screen recorder (OBS / CleanShot / `asciinema` for the terminal part). Convert to GIF or keep as an MP4 and host it in a reply-tweet. Put it at the top of the README (there's a placeholder for it).
4. `npm publish` (after `npm login`) so `npx git-recap` works for strangers. This is non-negotiable — the end card teaches `npx`, the package must exist.
5. Wrap **your own** profile repos and embed `recap.svg` in your profile README — you are the first share in the loop.

## Where to post, in order

| Channel | Angle | Timing |
| --- | --- | --- |
| **X/Twitter** | Your own wrapped card + "I built Spotify Wrapped for git. 100% local, zero deps, `npx git-recap`" | Tue–Thu, 9am ET |
| **Hacker News** | "Show HN: git-recap – Spotify Wrapped for your git history, fully local" | Tue–Thu, 8–10am ET. NEVER Monday, never Friday |
| **r/programming + r/commandline + r/devops** | Same as HN but lead with the privacy/local angle — that's what those subs reward | same day as HN |
| **Product Hunt** | Tagline: "Your year in code, wrapped." Gallery image = the share card | Sunday 12:01am PT prep, launch Tue |
| **dev.to / your blog** | Write-up: "I built Wrapped for git in 700 lines, zero deps" — teardown posts convert readers into stargazers | 2 days after HN |
| **LinkedIn** | The org/team angle ("your team's year, in one card") — seeds the paying audience | a week later |

**HN title that works** (concrete + free of hype):
> Show HN: git-recap – Spotify Wrapped for your git history (zero dependencies, fully local)

First comment you post yourself: what it does, why local matters, the tech (one `git log --numstat` pass, SVG generation, no deps), and what you'd build next.

## The compounding loop (why this specific design spreads)

1. Every `recap.svg` embedded in a README is seen by every repo visitor → "make yours → npx git-recap" is printed on the card itself.
2. The verdict slide ("The Midnight Architect 🦉") is an identity statement — people share identities, not statistics.
3. Wrapped season is real: November–January,Wrapped-content hunger is at its peak. **Launch in that window if you can wait.**

## If it hits

- Pin the repo on your profile, turn on Discussions, add a `good first issue` label set (themes + verdicts are one-table contributions by design).
- Answer every comment in the first 48h — comment velocity drives HN/Reddit ranking.
- Post the star-history graph at 1k/5k/10k — milestone posts are free second waves.

## If it flops

Wait 3 weeks, record a better demo GIF (motion sells this product far better than screenshots), improve the README headline, and relaunch with the `--org` team angle. Wrapped products get a seasonal rematch for free every December.
