# 04 — Proof

Every line below is a command that was run and its actual result. Nothing here
is a self-assessment; the acceptance criteria live in `01-SPEC.md`.

## Gate C — fresh clone, README only

```
git clone https://github.com/hkmpn9s6dh-commits/hackathon-2026-qnx.git _verify-clone
cd _verify-clone && bash scripts/verify.sh
```

```
== dependencies            PASS  node_modules present (npm ci from the lockfile)
== AC-1..AC-9 unit tests   PASS  15 unit tests / 2 files
== AC-10 performance       PASS  671 lines · 7.1 ms per analyse (budget 100 ms)
== typecheck + build       PASS  tsc -b && vite build (180.95 kB js, 10.17 kB css)
== AC-15 fixtures          PASS  4 .build fixtures, upstream header intact
== AC-16 grammar doc       PASS  2 documentation citations
== AC-14 bundle            PASS  no remote assets, relative asset paths
== AC-16 network           PASS  no network APIs, no remote asset loads
verify: all checks passed
```

The clone's own build was then served and driven:

```
node scripts/e2e.mjs --url http://127.0.0.1:4174/
PASS  no third-party network requests
PASS  console-dark sample reports 3 errors
PASS  finding click highlights its line — line 17
PASS  scrubbing the timeline changes the step
PASS  fixing the loader drops one error
PASS  typing appends instead of replacing — 1322 → 1347
all e2e checks passed
```

## Live site

```
curl -o /dev/null -w "%{http_code}" https://hkmpn9s6dh-commits.github.io/hackathon-2026-qnx/
200
```

Same e2e suite against the deployed URL: 6/6 pass.

## Gate D — blind ranking

Method: one screenshot of ours mixed with six reference surfaces, all 1440×900,
randomised letters, no key shared with the judge. The judge is asked for a
ranking and reasons, and is told to stop rather than guess if it cannot see the
images. Two rounds were run; the second after the process graph was rebuilt for
legibility.

### Round 1 — key `A=adarkroom B=raycast C=vercel D=linear E=stripe F=ours G=paperclips`

| Judge | Ranking | Ours |
|---|---|---|
| glm5.3f (AME-1334) | B > C > D > **F** > E > A > G | 4 / 7, above 3 references |
| gpt-6.1-sol (AME-1333) | never ran — queue never started | — |

Judge's words on ours: *"高密度开发者工具 … 是七张里最像专业工具的一屏"*, weakness
*"中下部进程小盒子的标签字号过小、略显拥挤"*.

### Round 2 — key `A=stripe B=ours C=paperclips D=raycast E=vercel F=linear G=adarkroom`

Rebuilt the topology so process chips alternate above and below the spine, moved
line numbers inside the chips, dropped the console overlay.

| Judge | Ranking | Ours |
|---|---|---|
| glm5.3f (AME-1337) | D > E > F > **B** > A > G > C | 4 / 7, above 3 references — pass |
| gpt-6.1-sol (AME-1336) | E > D > F > A > **B** > C > G | 5 / 7, above 2 references — **fail** |
| Fable5.1 (AME-1335) | run failed: credential error, cancelled | — |

gpt's reason: *"It is visually dense, with tiny labels, thin dividers, and many
competing accents that make first-glance scanning less effortless."*

**Round 2 verdict: not passed (one judge, one fail).** The gate requires every
judge to place it above at least three references.

### Round 3 — the approach changed, not the graph

Both judges named the same cause, so the third pass attacked density rather than
layout:

- every micro label went up one step (9.5 → 10.5–11 px); the editor to 13.5 px
  and a 23 px line height;
- three competing elements were removed: the per-row line numbers in the contents
  rail, the `background/foreground` sublabel inside each chip (a small ring now
  marks `[+session]`), and the mint colour on device labels (they are `--dim`
  until they are actually missing);
- the step counter lost its mint border; rows and findings gained 2–3 px of air.

Key: `A=raycast B=linear C=paperclips D=stripe E=adarkroom F=ours G=vercel`

| Judge | Ranking | Ours |
|---|---|---|
| gpt-6.1-sol (AME-1338) | _pending_ | — |
| glm5.3f (AME-1339) | _pending_ | — |

### Honest read of the gate

By the letter of the gate — *each judge places it above at least three
reference surfaces* — round 2 passes with one judge. It should be recorded with
two caveats, because a gate that is only technically met is a warning, not a
trophy:

1. **Two of the six references are not interface benchmarks.** `adarkroom` is a
   text game and `paperclips` is a single product photo; one judge explicitly
   wrote *"G — not an interface … can only be ranked last"*. Beating them is
   cheap. Against the four real product surfaces (`raycast`, `vercel`, `linear`,
   `stripe`) we place last or second-last.
2. **The result did not move between rounds.** The graph rewrite fixed the
   specific complaint and changed nothing in the ranking, which suggests the
   limiting factor is not the graph's legibility but the overall density: this is
   a tool screen being compared with marketing surfaces, and a judge ranking
   "which would I trust at a glance" will always prefer the emptier screen.

What that means for the next attempt (recorded, not acted on inside this
submission): build the ruler from six *application* surfaces (Sentry trace view,
Grafana, Chrome DevTools, Linear's app, a Vercel project page, Momentics System
Builder), never from landing pages. The comparison has to be dashboard-to-
dashboard or it measures the wrong thing.

## Recorded exceptions

- **1440×900 is the design target.** Below 1100 px the three-column layout keeps
  its proportions but the topology scrolls horizontally; that is deliberate — a
  bring-up tool lives on a laptop, not a phone.
- **`textarea` as the editor.** A code editor component was out of scope at Gate
  A; the plain textarea keeps the bundle at 180 kB and the caret behaviour is now
  covered by a test.
- **No scheduling simulation.** The graph is an ordering model and says so in its
  own caption. Anything about priority or timing would be a claim this tool
  cannot back with evidence.
