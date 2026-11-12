# 00 — Brief: Bootprint

**QNX Global Hackathon 2026 · Category: Developer Tooling & Host Tools**

## The one sentence

Bootprint reads a QNX system image buildfile the way the board will read it, and tells you where the boot dies — before you flash anything.

## Who has this problem

Anyone bringing up a QNX target: BSP engineers, driver writers, and the growing number of people who get an SDP through QNX Everywhere and try to boot their first image on QEMU or a Raspberry Pi.

A QNX OS image is one text file. `mkifs` turns it into an image; the board turns that image into a running system. When it does not come up, the only diagnostic is a serial console that may itself be dead — because the mistake was redirecting the console to a device whose driver starts four lines later.

The failure modes are not exotic. They are a short, well-known list:

- the console is redirected before the driver that creates it starts
- a daemon is started without `&`, so the script never reaches the next line
- the dynamic linker is missing, or is the 32-bit one in a 64-bit image
- a symlink points at a node nothing creates
- two entries claim the same path and the second silently wins

Every one of them is visible in the text. Nothing in the toolchain shows them to you.

## What Bootprint is

A host tool. It opens a `.build` file, parses it with line-accurate positions, resolves what the image will actually contain, replays the boot order, and reports what will fail and why — each finding pointing at the line to edit.

- **Parse** — the mkifs buildfile grammar as documented for SDP 8.0: attribute groups, global vs entry-scoped attributes, inline files with escapes, `dest=source` pairs, `[type=link]`.
- **Replay** — startup → procnto → each script line in order, with background processes spawning and foreground commands blocking. This is an ordering model, not a scheduler simulation; it answers "what is alive when line N runs", which is the question a boot hang asks.
- **Explain** — sixteen rules, each tied to a documented QNX behaviour, each with a line number and a concrete fix.
- **Edit** — the file stays editable in the tool; analysis re-runs on every keystroke.

## What Bootprint is not

- It does not build images. `mkifs` does that; Bootprint reads the same input.
- It does not simulate scheduling, timing or priority inversion. It models boot order only, and says so in the UI.
- It does not need a QNX licence, a target board, or a network connection. That is the point: the checks run on the host, in the browser, offline.

## Why this category

Developer Tooling & Host Tools is explicitly for tools that "make building for QNX easier, on the host or on the target". Bootprint is host-only by design, which is also why it can be tried in ten seconds by a judge who has never installed an SDP.

The QNX connection is in the artefact, not the README: the parser implements QNX's buildfile semantics (attribute persistence, `/proc/boot` placement, `ldqnx-64.so.2` vs `ldqnx.so.2`, `[+session]`, `waitfor`/`reopen`), and the repository carries real buildfiles from QNX-based projects as fixtures.

## Success

A judge who has hand-written a buildfile opens the sample with the dead console, sees the reopen-before-driver finding on the exact line, and recognises the afternoon it would have saved.
