import type { Buildfile, Severity } from './types'
import { attrLookup, inlineText } from './types'
import { availableOrder, replay, type Replay } from './timeline'
import { isDevicePath } from './devices'
import { lookupProvider } from './devices'
import { parseScript } from './script'

export type RuleId =
  | 'no-boot-image'
  | 'boot-without-startup'
  | 'boot-without-procnto'
  | 'boot-without-path'
  | 'no-startup-script'
  | 'no-dynamic-linker'
  | 'no-libc'
  | 'dangling-link'
  | 'duplicate-target'
  | 'link-with-contents'
  | 'reopen-before-driver'
  | 'foreground-blocks-boot'
  | 'shell-without-session'
  | 'device-never-provided'
  | 'linker-width-mismatch'
  | 'world-writable'

export interface Finding {
  rule: RuleId
  severity: Severity
  /** 1-based line in the .build file. */
  line: number
  title: string
  detail: string
  fix?: string
  entryIndex?: number
}

export interface RuleMeta {
  id: RuleId
  severity: Severity
  summary: string
  why: string
  doc?: string
}

export const RULES: RuleMeta[] = [
  {
    id: 'no-boot-image',
    severity: 'error',
    summary: 'No boot image entry',
    why: 'An OS image needs one entry carrying [virtual=…] with an inline boot script. mkifs has nothing to put in the image header without it.',
    doc: 'https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.building/topic/buildfiles/buildfile_syntax.html',
  },
  {
    id: 'boot-without-startup',
    severity: 'error',
    summary: 'Boot image never runs a startup-* binary',
    why: 'startup-* is what configures memory and timers and then transfers control to procnto. Without it the image cannot boot on any board.',
  },
  {
    id: 'boot-without-procnto',
    severity: 'error',
    summary: 'Boot image never starts procnto',
    why: 'procnto is the microkernel plus process manager. Nothing else can be scheduled without it.',
  },
  {
    id: 'boot-without-path',
    severity: 'warning',
    summary: 'PATH is not set before procnto',
    why: 'The boot script resolves binaries through PATH (normally /proc/boot). Without it, later lines that name a bare binary have nothing to resolve against.',
  },
  {
    id: 'no-startup-script',
    severity: 'warning',
    summary: 'No [+script] entry',
    why: 'Drivers and applications are started by the [+script] entry. An image with a kernel and no script boots to a prompt-less void.',
  },
  {
    id: 'no-dynamic-linker',
    severity: 'error',
    summary: 'Dynamically linked binaries but no ldqnx loader in the image',
    why: 'QNX binaries are dynamically linked by default and need ldqnx-64.so.2 (64-bit) or ldqnx.so.2 (32-bit) at /usr/lib. Without it every binary fails with “unable to locate dynamic linker”.',
  },
  {
    id: 'no-libc',
    severity: 'warning',
    summary: 'No libc.so in the image',
    why: 'Every C binary in the image links against libc.so. Trimmed images that forget it boot to a cascade of load failures.',
  },
  {
    id: 'dangling-link',
    severity: 'error',
    summary: 'Symlink points at something that is never created',
    why: '[type=link] creates a symlink at build time. If its target is neither in the image nor created by a process in the startup script, the link dangles.',
  },
  {
    id: 'duplicate-target',
    severity: 'warning',
    summary: 'Same destination path appears twice',
    why: 'mkifs keeps the last one, silently. A duplicated path is almost always a stale line left behind after a refactor.',
  },
  {
    id: 'link-with-contents',
    severity: 'error',
    summary: '[type=link] entry also carries inline contents',
    why: 'A link has no contents. mkifs rejects the combination, or silently drops the body — either way what you wrote is not what you get.',
  },
  {
    id: 'reopen-before-driver',
    severity: 'error',
    summary: 'Console is redirected to a device that does not exist yet',
    why: 'reopen happens immediately. If the driver that creates the device starts later in the same script, the console is dead for the rest of the boot.',
  },
  {
    id: 'foreground-blocks-boot',
    severity: 'warning',
    summary: 'A foreground command stalls the rest of the boot',
    why: 'Commands without a trailing “&” are waited on. Anything below this line only runs once the command exits — which a daemon never does.',
  },
  {
    id: 'shell-without-session',
    severity: 'warning',
    summary: 'Interactive shell started without [+session]',
    why: 'A shell needs its own session and controlling terminal. Started as a plain background job it dies with its parent and never answers.',
  },
  {
    id: 'device-never-provided',
    severity: 'warning',
    summary: 'A process is handed a device path that is never created',
    why: 'No process in this image publishes that path, and it is not in the image. The process will block on open() with no diagnostic.',
  },
  {
    id: 'linker-width-mismatch',
    severity: 'warning',
    summary: 'Dynamic linker does not match the target width',
    why: '64-bit targets need ldqnx-64.so.2, 32-bit targets need ldqnx.so.2. Mixing them produces “Exec format error” at the first exec.',
  },
  {
    id: 'world-writable',
    severity: 'info',
    summary: 'Entry is world-writable',
    why: 'A writable binary in a read-only image is either a typo in perms or a hole in an otherwise immutable system.',
  },
]

export interface Analysis {
  findings: Finding[]
  replay: Replay
  counts: Record<Severity, number>
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

/**
 * Where a listed file actually ends up in the image. Bare names land in
 * /proc/boot — that is what PATH=/proc/boot in the boot script resolves to.
 */
function targetPath(entry: { target: string }): string {
  return entry.target.startsWith('/') ? entry.target : `/proc/boot/${entry.target}`
}

export function analyze(build: Buildfile): Analysis {
  const findings: Finding[] = []
  const rep = replay(build)
  const add = (f: Finding) => findings.push(f)

  const vm = build.entries.find((e) => attrLookup(e.attrs).has('virtual'))
  const vmAttrs = vm ? attrLookup(vm.attrs) : undefined
  const virtual = vmAttrs?.get('virtual') ?? ''
  const arch = virtual.split(',')[0] ?? ''

  if (!vm || !vm.inline) {
    const hasScript = build.entries.some((e) => attrLookup(e.attrs).has('script'))
    add({
      rule: 'no-boot-image',
      severity: hasScript ? 'warning' : 'error',
      line: 1,
      title: hasScript ? 'No boot image entry in this file' : 'No boot image entry',
      detail: hasScript
        ? 'This file carries a startup script but no [virtual=…] block. Images are sometimes assembled from several buildfiles, so this may be one fragment — check the file that holds the boot block.'
        : 'Nothing in this file carries [virtual=…] with an inline boot script.',
      fix: 'Add the boot entry, e.g. [virtual=x86_64,bios +compress] boot = { … }',
    })
  } else {
    const bootText = vm.inline ? inlineText(vm.inline) : ''
    const bootFlat = bootText
      .split('\n')
      .map((l) => l.replace(/\s+#.*$/, '').trim())
      .filter((l) => l && !l.startsWith('#'))
    if (!bootFlat.some((l) => /(^|\s|\/)(startup-[A-Za-z0-9_-]+)/.test(l.split('=')[0] ?? ''))) {
      add({
        rule: 'boot-without-startup',
        severity: 'error',
        line: vm.inline.startLine + 1,
        title: 'Boot image never runs a startup-* binary',
        detail: 'The boot script goes straight past board initialisation.',
        fix: 'Put the BSP startup binary on the first line, e.g. startup-x86 -v',
      })
    }
    if (!bootFlat.some((l) => /(^|\s|\/)procnto/.test(l.split('=')[0] ?? ''))) {
      add({
        rule: 'boot-without-procnto',
        severity: 'error',
        line: vm.inline.startLine + 1,
        title: 'Boot image never starts procnto',
        detail: 'No kernel in the boot script, so nothing can be scheduled.',
        fix: 'Add procnto (or procnto-smp-instr) after the startup line.',
      })
    }
    if (!bootFlat.some((l) => /^PATH=/.test(l))) {
      add({
        rule: 'boot-without-path',
        severity: 'warning',
        line: vm.inline.startLine + 1,
        title: 'PATH is not set before procnto',
        detail: 'Binaries named later in the boot script have nothing to resolve against.',
        fix: 'Add PATH=/proc/boot before the procnto line.',
      })
    }
  }

  const scripts = build.entries.filter((e) => attrLookup(e.attrs).has('script'))
  if (!scripts.length) {
    add({
      rule: 'no-startup-script',
      severity: 'warning',
      line: vm?.line ?? 1,
      title: 'No [+script] entry',
      detail: 'The image has no startup script, so no driver or application is ever started.',
      fix: 'Add [+script] startup-script = { … } and start at least the console driver.',
    })
  }

  const scriptBinaries = new Set<string>()
  for (const s of scripts) {
    for (const step of parseScript(s).steps) {
      if (step.kind === 'command') scriptBinaries.add(step.name)
    }
  }

  const imageTargets = new Map<string, number>()
  for (const entry of build.entries) {
    const attrs = attrLookup(entry.attrs)
    if (attrs.has('script') || attrs.has('virtual') || attrs.get('type') === 'link') continue
    const path = targetPath(entry)
    const prev = imageTargets.get(path)
    if (prev !== undefined) {
      add({
        rule: 'duplicate-target',
        severity: 'warning',
        line: entry.line,
        title: `“${path}” is already provided on line ${prev}`,
        detail: 'mkifs keeps the last entry and silently drops the earlier one.',
        fix: 'Delete the stale line, or rename the destination.',
        entryIndex: entry.index,
      })
    } else {
      imageTargets.set(path, entry.line)
    }
  }

  const hasLoader = build.entries.some((e) => /(^|\/)ldqnx(-64)?\.so(\.\d+)?$/.test(targetPath(e)))
  const loaderNames = build.entries
    .filter((e) => /ldqnx(-64)?\.so(\.\d+)?$/.test(targetPath(e)))
    .map((e) => targetPath(e))
  const hasLibc = build.entries.some((e) => /(^|\/)libc\.so(\.\d+)?$/.test(targetPath(e)))

  if (scriptBinaries.size > 0 && !hasLoader) {
    add({
      rule: 'no-dynamic-linker',
      severity: 'error',
      line: scripts[0]?.line ?? 1,
      title: 'Started binaries but no ldqnx loader in the image',
      detail: `The script starts ${[...scriptBinaries].slice(0, 3).join(', ')}${scriptBinaries.size > 3 ? '…' : ''}, but no ldqnx*.so* entry is listed. Every exec will fail with “unable to locate dynamic linker”.`,
      fix: 'List ldqnx-64.so.2 (64-bit) or ldqnx.so.2 (32-bit) under /usr/lib, usually as /usr/lib/ldqnx-64.so.2=ldqnx-64.so.2.',
    })
  }
  if (scriptBinaries.size > 0 && !hasLibc) {
    add({
      rule: 'no-libc',
      severity: 'warning',
      line: scripts[0]?.line ?? 1,
      title: 'No libc.so in the image',
      detail: 'Every C binary links against libc.so; a trimmed image that drops it fails at the first load.',
      fix: 'Add libc.so to the file list at the bottom of the buildfile.',
    })
  }

  const is64 = /aarch64|x86_64|riscv64|_64|64$/.test(arch)
  if (hasLoader && arch) {
    const wants64 = is64
    const has32 = loaderNames.some((n) => /ldqnx\.so/.test(n))
    const has64 = loaderNames.some((n) => /ldqnx-64\.so/.test(n))
    if (wants64 && has32 && !has64) {
      add({
        rule: 'linker-width-mismatch',
        severity: 'warning',
        line: build.entries.find((e) => /ldqnx\.so/.test(targetPath(e)))?.line ?? 1,
        title: `32-bit loader in a ${arch} image`,
        detail: `[virtual=${virtual}] builds a 64-bit image, but only ldqnx.so.2 (32-bit) is present.`,
        fix: 'Use /usr/lib/ldqnx-64.so.2=ldqnx-64.so.2.',
      })
    } else if (!wants64 && has64) {
      add({
        rule: 'linker-width-mismatch',
        severity: 'warning',
        line: build.entries.find((e) => /ldqnx-64\.so/.test(targetPath(e)))?.line ?? 1,
        title: `64-bit loader in a ${arch} image`,
        detail: `[virtual=${virtual}] builds a 32-bit image, but only ldqnx-64.so.2 is present.`,
        fix: 'Use /usr/lib/ldqnx.so.2=ldqnx.so.2.',
      })
    }
  }

  for (const entry of build.entries) {
    const attrs = attrLookup(entry.attrs)
    if (attrs.get('type') !== 'link') continue
    if (entry.inline) {
      add({
        rule: 'link-with-contents',
        severity: 'error',
        line: entry.line,
        title: `“${entry.target}” is a link and also carries contents`,
        detail: 'A symlink cannot carry a body. mkifs will not produce what this line reads like.',
        fix: 'Drop either the [type=link] attribute or the inline block.',
        entryIndex: entry.index,
      })
    }
    const source = entry.source ?? ''
    if (source.startsWith('/')) {
      const provided = availableOrder(rep, source)
      const inImage = imageTargets.has(source)
      if (!inImage && provided === undefined) {
        add({
          rule: 'dangling-link',
          severity: 'error',
          line: entry.line,
          title: `“${entry.target}” points at ${source}, which nothing creates`,
          detail: `Neither the image nor any process in the startup script publishes ${source}, so the link dangles.`,
          fix: 'Point the link at a real node, or start the driver that creates it before anything opens it.',
          entryIndex: entry.index,
        })
      }
    }
  }

  for (const c of rep.console) {
    const ready = availableOrder(rep, c.path)
    if (ready === undefined) {
      add({
        rule: 'reopen-before-driver',
        severity: 'error',
        line: rep.events.find((e) => e.kind === 'reopen' && e.order === c.order)?.line ?? 1,
        title: `Console redirected to ${c.path}, which no driver in this image creates`,
        detail: 'The redirect succeeds only if the node already exists. Nothing here creates it.',
        fix: `Start the driver that owns ${c.path} before this line, and wait for it with “waitfor ${c.path}” if it appears asynchronously.`,
      })
    } else if (ready > c.order) {
      const line = rep.events.find((e) => e.kind === 'reopen' && e.order === c.order)?.line ?? 1
      add({
        rule: 'reopen-before-driver',
        severity: 'error',
        line,
        title: `Console redirected to ${c.path} before its driver starts`,
        detail: `The driver publishes ${c.path} later in the same script, so the console goes dark right here.`,
        fix: `Move this reopen below the driver, or guard it with “waitfor ${c.path}” before redirecting.`,
      })
    }
  }

  for (const proc of rep.processes) {
    const kind = lookupProvider(proc.name)?.kind
    const isDaemon = kind === 'driver' || kind === 'network' || kind === 'filesystem' || kind === 'service'
    if (proc.blocking && isDaemon && proc.order < rep.length - 2) {
      add({
        rule: 'foreground-blocks-boot',
        severity: 'warning',
        line: proc.line,
        title: `${proc.name} runs in the foreground`,
        detail: 'Everything below this line waits for it to exit. Daemons never do.',
        fix: `Append “&” to start it in the background.`,
      })
    }
    if (/^(sh|ksh|esh|bash)$/.test(proc.name) && !proc.session) {
      add({
        rule: 'shell-without-session',
        severity: 'warning',
        line: proc.line,
        title: `${proc.name} started without [+session]`,
        detail: 'No controlling terminal, no job control; it dies with its parent.',
        fix: `Write “[+session] ${proc.name} &”.`,
      })
    }
    for (const arg of proc.args) {
      if (availableOrder(rep, arg) === undefined && !imageTargets.has(arg)) {
        add({
          rule: 'device-never-provided',
          severity: 'warning',
          line: proc.line,
          title: `${proc.name} is given ${arg}, which nothing in this image creates`,
          detail: 'open() on a path that never appears blocks or fails with no diagnostic on a serial console.',
          fix: 'Start the driver that owns the node first, or drop the argument.',
        })
      }
    }
    const perms = build.entries
      .find((e) => targetPath(e) === `/proc/boot/${proc.name}` || targetPath(e) === `/${proc.name}`)
      ?.attrs.find((a) => a.name.toLowerCase() === 'perms')?.value
    if (perms && /^0?[0-7]?[0-7][67][67]$/.test(perms)) {
      add({
        rule: 'world-writable',
        severity: 'info',
        line: proc.line,
        title: `${proc.name} is world-writable (${perms})`,
        detail: 'Anything in the system can replace this binary.',
        fix: 'Use 0755 for binaries.',
      })
    }
  }

  for (const entry of build.entries) {
    const perms = attrLookup(entry.attrs).get('perms')
    if (perms && /^0?[0-7]?[0-7][67][67]$/.test(perms) && !rep.processes.some((p) => p.name === entry.target)) {
      add({
        rule: 'world-writable',
        severity: 'info',
        line: entry.line,
        title: `“${entry.target}” is world-writable (${perms})`,
        detail: 'A writable file in a read-only image is usually a typo.',
        fix: 'Use 0644 for data, 0755 for binaries.',
        entryIndex: entry.index,
      })
    }
  }

  findings.sort((a, b) => a.line - b.line || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  for (const f of findings) counts[f.severity]++

  return { findings, replay: rep, counts }
}

export function ruleMeta(id: RuleId): RuleMeta | undefined {
  return RULES.find((r) => r.id === id)
}

void isDevicePath
