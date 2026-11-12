# 02 — Grammar: the mkifs buildfile subset Bootprint implements

Every construct below is implemented in `src/core/parse.ts` or `src/core/script.ts`.
Where the QNX documentation defines a semantic, the page is cited — that citation
is what makes a finding defensible rather than a guess.

Source of truth: *Building Embedded Systems* (QNX SDP 8.0), plus the `mkifs`
entry in the Utilities Reference.

## 1. Structure of a file

> "The buildfile text may include blank lines and comments. All sections are
> optional, but not all combinations are permitted. The general format for a
> buildfile is: `attribute filename contents`"
> — <https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.building/topic/buildfiles/buildfile_syntax.html>

Implemented:

| Construct | Form | Notes |
|---|---|---|
| Comment | `# …` to end of line | A `#` must be preceded by whitespace to count (so `echo "#x"` inside an inline script survives). |
| Attribute group | `[attr attr=value +flag -flag]` | Parsed into `{kind: on/off/value, name, value, line}`. |
| Entry | `filename`, or `dest=source`, optionally followed by `= { … }` | `dest` and `source` may be quoted. |
| Inline file | opening `{` ends the line; closing `}` is a line of its own | Contents may not share a line with either brace. |

## 2. Attribute persistence

> "Attributes can apply to a single file or to all files listed after the attribute."
> — same page, *Attributes*

Implemented as two scopes:

- a group **alone on its line** becomes the default for every following entry
  (`[image=0x1400000]` at the top of a file);
- a group **on the same line as a filename** applies to that entry only
  (`[type=link] /tmp=/dev/shmem`).

This is the single most common source of confusion when reading a buildfile by
eye, and it is why `[type=link]` on one line does not turn the next file into a
link.

## 3. Inline files and escapes

> "To put `{`, `}`, or `\` characters in the file, precede each one by a backslash."
> — same page, *Inline files*

`inlineText()` resolves `\{` → `{`, `\}` → `}`, `\\` → `\`. An unclosed inline
file is reported as a parse error at the opening brace rather than swallowing the
rest of the file.

## 4. Where files land

A bare filename is placed in `/proc/boot`, which is why `PATH=/proc/boot` in the
boot script can resolve it:

> `[+script] startup-script = { … }` with `PATH=/proc/boot` and a file list of
> bare names — the documented minimal image.
> — <https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.building/topic/config/minimal_configuration.html>

An absolute destination keeps its path (`/usr/lib/ldqnx-64.so.2=ldqnx-64.so.2`).

## 5. Boot script semantics

Implemented builtins (`src/core/script.ts`):

| Token | Meaning | Source |
|---|---|---|
| `NAME=value` | environment inherited by everything started afterwards | *Building Embedded Systems*, boot script |
| `cmd &` | start in the background | same |
| `[+session]` | start in its own session, with a controlling terminal | same |
| `waitfor path` | block until the path appears | same |
| `reopen path` | point stdin/stdout/stderr at `path` from here on | same |
| `display_msg` | print to the boot console | same |
| `procmgr_symlink a b` | create a symlink at boot time | same |

`reopen` is the one that kills images: it happens **immediately**, so if the
driver that creates the device starts later in the same script, the console goes
dark at that line. Hence `reopen-before-driver`, and hence the recommended
`waitfor` before it.

## 6. Deliberately not implemented

Naming these is part of the contract:

- **No `mkefs` flash-filesystem buildfiles.** Different attribute set, different
  tool. Bootprint reports the file it cannot model rather than guessing.
- **No `[search=]` resolution against a host SDP.** The tool never reads your
  disk; it reasons about what the text says, not about which binaries exist on
  the build machine.
- **No image-size accounting.** `[image=0x…]` is parsed and shown, but file
  sizes are unknown to a browser, so no "image is too big" claim is made.
- **No scheduling or timing simulation.** Boot order only. Priority inheritance,
  CPU budgets and interrupt latency are out of scope, and the UI says so under
  the graph.
- **No `[+raw]`, flash wear-levelling or IPL scripting.** Out of scope for a
  bring-up reader.
