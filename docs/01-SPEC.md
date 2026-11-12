# 01 — SPEC: Bootprint

> Gate A. Written before the main screen existed. Everything below is either a
> behaviour the board depends on, or a promise the demo makes. After Gate A the
> scope only shrinks.

## 0. Judging table (official, QNX Global Hackathon — Stage Two, equally weighted)

| Criterion | What the judges ask | Where this project answers |
|---|---|---|
| **Technological Implementation** | Is it really built for QNX, with real engineering effort? | A hand-written mkifs buildfile parser: attribute persistence, `/proc/boot` placement, inline files with escapes, boot-order replay. 16 rules, each traced to documented QNX behaviour. |
| **Design** | Is it a coherent product, not a technical proof of concept? | One screen: contents, replay, graph, source, findings. Every finding is a line you can click. Nothing is a dead end. |
| **Potential Impact** | Does it solve a real problem for a market QNX serves, and is a real-time OS the right foundation? | Boot bring-up is the first wall for every BSP engineer and every QNX Everywhere newcomer. The tool is useful *because* the failure is silent on a serial console. |
| **Innovation & AI Creativity** | Is the use of the platform non-obvious? | Nobody visualises a buildfile as a boot timeline. The replay makes "what is alive at line 34" a thing you can scrub. |

## 1. Demo script (first person, 75 seconds)

| t | On screen | Voice |
|---|---|---|
| 0–8 s | A buildfile, plain text, cursor blinking on `reopen /dev/ser1` | "A QNX image is a text file. This one builds, flashes, and boots to a dead console. Finding out why costs an afternoon on a serial port." |
| 8–18 s | Drag the file in. Findings fill the right rail; three are red. The timeline marks the exact step. | "Bootprint reads it the way the board will." |
| 18–30 s | Click "Console redirected before its driver starts". Source jumps to line 12; the graph shows `devc-ser8250` starting two steps later. | "The console points at a device whose driver starts two lines down. Nothing is listening yet." |
| 30–42 s | Scrub the replay. Nodes light in order; at the reopen step the console node stays dark. | "Scrub the boot and watch it die at the step it dies at." |
| 42–58 s | Fix it in place: move `reopen` under `waitfor`. The finding disappears; the timeline turns green. | "Fix it here, and the image is correct before it ever touches hardware." |
| 58–70 s | Switch to the real in-the-wild sample; one dangling symlink is found. | "On a real project's buildfile, it found a symlink pointing at a node nobody creates." |
| 70–75 s | Wordmark. | "Bootprint. See the boot before the board does." |

## 2. Acceptance criteria

Each AC is checked by `scripts/verify.sh` (headless, no browser) or by
`scripts/e2e.mjs` (Playwright against the built bundle). "Self-test" never
counts as proof: the AC names the command that fails when the behaviour is
missing.

### Parser

- **AC-1** `parseBuildfile` returns one entry per file line, with 1-based line
  numbers. Check: `npm test -- parse` asserts entry count and `line` for every
  fixture.
- **AC-2** An attribute group written on its own line applies to every following
  entry; a group written on the same line as a filename applies only to that
  entry. Check: unit test `does not leak an inline attribute group onto the next entry`.
- **AC-3** A bare filename lands at `/proc/boot/<name>` when the image is
  resolved; an absolute name keeps its path. Check: unit test on
  `[type=link] /bin/sh=/proc/boot/ksh` against an image that lists `ksh`.
- **AC-4** Inline files keep their exact body, resolve `\{`, `\}` and `\\`, and
  an unclosed `{` produces a parse error instead of swallowing the file. Check:
  `never closed` unit test.
- **AC-5** `dest=source` pairs are split on the first unquoted `=`, and quoted
  filenames are unquoted. Check: unit test on
  `/usr/lib/ldqnx-64.so.2=ldqnx-64.so.2`.

### Semantics

- **AC-6** Boot order follows file order: background commands spawn, foreground
  commands block, and `waitfor`/`reopen`/`display_msg`/`procmgr_symlink` are
  recognised as builtins rather than processes. Check: `replay` unit tests.
- **AC-7** `procnto` publishes `/dev/shmem`, `/dev/null` and `/dev/zero` from the
  moment the kernel takes over, so `[type=link] /tmp=/dev/shmem` is not reported
  as dangling. Check: clean-sample test expects zero errors.
- **AC-8** Sixteen rules exist and every rule has a fixture that fires it.
  Check: `npm test -- rules` covers all ids in `RULES`.
- **AC-9** Every finding carries a line number that points at the line to edit,
  and `line` is within the file. Check: property test over all fixtures.

### Product

- **AC-10** Dropping or opening a `.build` file analyses it in under 100 ms for
  a 600-line file on the demo laptop. Check: `scripts/bench.mjs`.
- **AC-11** Clicking a finding scrolls the source pane to its line and marks it.
  Check: `scripts/e2e.mjs` asserts `[data-line="12"]` has `aria-current="true"`.
- **AC-12** The replay is scrubbable: at most one step is active, and the active
  step's source line is highlighted. Check: e2e clicks the timeline and asserts
  the highlighted line changes.
- **AC-13** Editing the source re-analyses without a reload and the finding
  count changes. Check: e2e types into the editor and asserts the error pill
  count changes.
- **AC-14** The built bundle makes zero network requests and works from
  `file://`. Check: e2e records requests; `scripts/verify.sh` greps `dist/` for
  `http://` and `https://` in script and link tags.

### Evidence of QNX use

- **AC-15** The repository ships at least three real buildfiles, one of them
  from an upstream project (Apache-2.0, header preserved), plus the documented
  QNX minimal configuration. Check: `ls src/data/samples/*.build`.
- **AC-16** `docs/02-GRAMMAR.md` documents the subset of the mkifs grammar the
  parser implements, with the QNX doc URL for each construct, and names what is
  deliberately not implemented.

## 3. Out of scope (Gate A decision)

- No image building, no `mkifs` invocation, no binary output.
- No timing or scheduling simulation. Boot order only.
- No QNX target, no licence, no QEMU dependency for the tool to work.
- No server. No account. No telemetry.
- No plugin system, no theme switcher, no settings screen.

## 4. Risks

| Risk | Mitigation |
|---|---|
| Judges read "host tool" as "not really QNX" | The parser implements QNX semantics, not a generic ini format; real buildfiles are fixtures; the grammar doc cites the QNX pages. |
| A rule fires on a valid image | Every rule is tested both ways: fires on the broken fixture, silent on the clean one. Rules that cannot be decided from the text are not implemented. |
| The UI reads as a code viewer | The replay is the product: a timeline you scrub, not a linter list. |
