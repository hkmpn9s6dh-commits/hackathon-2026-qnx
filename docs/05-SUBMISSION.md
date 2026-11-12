# 05 — Submission copy (Devpost fields, paste-ready)

> Every field below is written to be pasted as-is. Line breaks matter on Devpost;
> the "What it does" block is the one a judge skims first.

## Project name

Bootprint

## Elevator pitch (≤ 200 chars)

Read a QNX system image the way the board will: parse the buildfile, replay the boot order, and see the exact line that kills the console — before you flash anything.

## Category

Developer Tooling & Host Tools

## Links

- Try it: https://hkmpn9s6dh-commits.github.io/hackathon-2026-qnx/
- Code: https://github.com/hkmpn9s6dh-commits/hackathon-2026-qnx
- Video: _(YouTube link — filled in after upload)_

## Inspiration

A QNX image is one text file. `mkifs` turns it into an image, the board turns that image into a running system — and when it does not come up, the only diagnostic is a serial console that may itself be dead, because the mistake was redirecting the console to a device whose driver starts four lines later.

Everyone who has brought up a QNX target has lost that afternoon. The failure modes are not exotic; they are a short, well-known list that is entirely visible in the text, and nothing in the toolchain shows them to you. Momentics will build the image. Nothing tells you it will boot to a void.

## What it does

Bootprint opens a `.build` file and answers four questions, in one screen:

1. **What will this image contain?** A line-accurate parser for the mkifs buildfile grammar: attribute groups, global vs entry-scoped attributes, inline files with `\{` `\}` escapes, `dest=source` pairs, `[type=link]`, `[+script]`, `[+session]`. Bare filenames resolve to `/proc/boot`, which is what `PATH=/proc/boot` in the boot script actually points at.
2. **In what order does it come alive?** A boot replay: startup → procnto → each script line in order. Background commands spawn, foreground commands block, and `waitfor`, `reopen`, `display_msg` and `procmgr_symlink` are modelled as builtins rather than processes. You can scrub the timeline and watch each process appear.
3. **What will fail, and where?** Sixteen rules, each tied to documented QNX behaviour — console redirected before its driver, daemon started without `&`, missing or wrong-width dynamic linker, dangling symlink, two entries claiming one path, shell without a session, a process handed a `/dev` node nothing creates. Every finding names the line to edit and the fix.
4. **Is it fixed?** The source stays editable; analysis re-runs on every keystroke, and the finding disappears when the mistake does.

The screen is built around one idea: **the boot is a timeline you can scrub, and the step that kills the console is red.** Everything after that step is drawn as a dead zone, because that is exactly what it is — the rest of the script prints into nothing.

## How we built it

- **Pure TypeScript, no backend.** The parser, resolver, replay and rule engine are a dependency-free core (`src/core`) with 15 unit tests that run in 12 ms. The UI is React + Vite, shipped as a static bundle that works from `file://`.
- **The grammar came from the documentation, not from guessing.** Each construct in `docs/02-GRAMMAR.md` cites the QNX *Building Embedded Systems* page it comes from, and the doc also names what is deliberately not implemented (no `mkefs`, no `[search=]` resolution against a host SDP, no image-size claims, no timing simulation).
- **The rules are tested both ways.** Every rule fires on a fixture that contains the mistake and stays silent on a clean image — otherwise a linter becomes noise.
- **A real buildfile is in the repo.** `s-core-init.build` is the Eclipse s-core reference integration's QNX init buildfile (Apache-2.0, header preserved). Running Bootprint on it finds a symlink — `/data` → `/tmp_ram` — that points at a node nothing creates.
- **Verification is a script.** `scripts/verify.sh` runs the unit tests, a 671-line performance budget (7 ms), the typecheck, the build, and checks that the shipped bundle makes no network calls. `scripts/e2e.mjs` drives the built page in a real browser and asserts that clicking a finding moves the source, that scrubbing changes the step, and that typing inserts rather than replaces.

## Challenges we ran into

- **Attribute persistence.** In a buildfile, a `[…]` group alone on its line is a default for everything that follows, while a group on the same line as a filename applies to that entry only. Getting this wrong makes `[type=link] /tmp=/dev/shmem` turn the next file into a link. The first version of the parser had exactly that bug; a test named after it now guards it.
- **What the kernel already owns.** `/dev/shmem`, `/dev/null` and `/dev/zero` exist as soon as procnto runs. Without modelling that, every `[type=link] /tmp=/dev/shmem` in the world reports as a dangling link.
- **Geometry width.** `aarch64le` is a 64-bit target. A naive "ends with 64" check flagged the correct 64-bit loader in an aarch64 image as a mismatch; the e2e recording caught it.
- **A textarea that ate its own line.** Re-selecting the active line on every render made typing replace the line under the caret. It only showed up in the demo recording, not in the tests — so now there is a test for it.

## Accomplishments we are proud of

- The replay makes a static file answer a question that normally requires hardware: *what is alive when line 17 runs?*
- The tool finds a real defect in a real upstream buildfile, unprompted.
- The whole thing is 180 KB of JavaScript, runs offline, and needs no QNX licence — which is also why a judge can try it in ten seconds.

## What we learned

A buildfile is a program with an execution order, and everyone reads it as a list. Once you model the order, most bring-up failures stop being mysteries and become line numbers.

## What's next for Bootprint

- Read the multi-file layout (`qnx_ifs`-style fragments) as one image instead of one file at a time.
- Turn findings into patches: "move `reopen` below `waitfor`" as a one-click edit.
- A `--check` mode for CI, so an image that cannot boot never reaches a board.

## Built with

`typescript` `react` `vite` `vitest` `playwright` `qnx` `mkifs` `buildfile` `embedded` `rtos` `static-analysis`

## QNX usage (the required explanation)

Bootprint is a **host tool**: it runs on Windows, macOS or Linux and analyses software that targets QNX 8.0. It does not need a QNX target to run, and it never calls `mkifs` — it reads the same input `mkifs` reads.

The QNX connection is in the artefact:

- `src/core/parse.ts` implements mkifs buildfile semantics: attribute persistence, entry-scoped groups, `/proc/boot` placement, inline-file escapes, `dest=source`.
- `src/core/timeline.ts` models the boot script's execution order, including `waitfor` / `reopen` as builtins and `[+session]` as its own session.
- `src/core/devices.ts` encodes what QNX components publish (`procnto` → `/dev/shmem`; `devc-ser*` → `/dev/ser*`; `devb-*` → block devices; `io-pkt`/`io-sock` → `/dev/socket`).
- The repository ships real buildfiles as fixtures, including the Eclipse s-core QNX init buildfile, and the documented minimal QNX 8.0 configuration.
- `docs/02-GRAMMAR.md` cites the QNX documentation page for every construct implemented.

## Notes for the submitter (not part of the Devpost text)

- Upload `video/bootprint-demo.webm` to YouTube as **public**, title
  `Bootprint — read a QNX image before the board does`. WebM is accepted.
- Paste the YouTube URL into the Video field and into the Links section above.
- Choose category **Developer Tooling & Host Tools** on the submission form.
- Ask for feedback? No.
