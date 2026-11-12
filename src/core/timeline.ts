import type { Buildfile, BuildEntry } from './types'
import { attrLookup, inlineText } from './types'
import { isDevicePath, lookupProvider, pathMatches } from './devices'
import { parseScript } from './script'

export interface BootLine {
  line: number
  text: string
  role: 'startup' | 'procnto' | 'env' | 'other'
  name?: string
}

export interface ProcessRun {
  id: string
  name: string
  /** Line in the .build file that starts this process. */
  line: number
  order: number
  background: boolean
  session: boolean
  prio?: number
  provides: string[]
  blocking: boolean
  /** Paths this process was given on the command line (candidate dependencies). */
  args: string[]
}

export type ReplayKind =
  | 'boot'
  | 'startup'
  | 'kernel'
  | 'start'
  | 'block'
  | 'reopen'
  | 'env'
  | 'note'

export interface ReplayEvent {
  order: number
  line: number
  kind: ReplayKind
  label: string
  detail?: string
  processId?: string
}

export interface Replay {
  events: ReplayEvent[]
  processes: ProcessRun[]
  bootLines: BootLine[]
  console: { order: number; path: string }[]
  /** Path pattern → order at which it first becomes available. */
  providedAt: Map<string, number>
  /** Total number of steps in the replay. */
  length: number
}

function isProcnto(name: string): boolean {
  return /(^|\/)procnto/.test(name)
}

function isStartup(name: string): boolean {
  return /(^|\/)startup-/.test(name)
}

function readBootLines(entry: BuildEntry): BootLine[] {
  if (!entry.inline) return []
  const out: BootLine[] = []
  const body = inlineText(entry.inline).split('\n')
  body.forEach((raw, idx) => {
    const line = entry.inline!.startLine + 1 + idx
    const text = raw.replace(/\s+#.*$/, '').trim()
    if (!text || text.startsWith('#')) return
    if (isStartup(text.split(/\s+/)[0] ?? '')) {
      out.push({ line, text, role: 'startup', name: (text.split(/\s+/)[0] ?? '').split('/').pop() })
      return
    }
    if (isProcnto(text.split(/\s+/)[0] ?? '')) {
      out.push({ line, text, role: 'procnto', name: (text.split(/\s+/)[0] ?? '').split('/').pop() })
      return
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(text)) {
      out.push({ line, text, role: 'env' })
      return
    }
    out.push({ line, text, role: 'other' })
  })
  return out
}

/**
 * Rebuild the boot order the way the image would experience it: startup →
 * procnto → each command of the startup script, in file order, with
 * background commands spawning a process and foreground commands blocking the
 * rest of the script.
 *
 * This is an ordering model, not a scheduler simulation: it answers "what is
 * alive by the time line N runs", which is the question a boot hang asks.
 */
export function replay(build: Buildfile): Replay {
  const events: ReplayEvent[] = []
  const processes: ProcessRun[] = []
  const consoleTimeline: { order: number; path: string }[] = []
  const providedAt = new Map<string, number>()
  let order = 0

  const bootEntry = build.entries.find((e) => attrLookup(e.attrs).has('virtual') && e.inline)
  const bootLines = bootEntry ? readBootLines(bootEntry) : []

  if (bootEntry) {
    events.push({
      order: order++,
      line: bootEntry.line,
      kind: 'boot',
      label: `Image “${bootEntry.target}” loaded`,
      detail: attrLookup(bootEntry.attrs).get('virtual') ?? undefined,
    })
    for (const bl of bootLines) {
      if (bl.role === 'startup') {
        events.push({
          order: order++,
          line: bl.line,
          kind: 'startup',
          label: `${bl.name} initialises the board`,
          detail: 'memory, timers and the debug channel, then it jumps into the kernel',
        })
      } else if (bl.role === 'procnto') {
        const kernel = lookupProvider(bl.name ?? 'procnto')
        for (const path of kernel?.provides ?? []) {
          if (!providedAt.has(path)) providedAt.set(path, order)
        }
        events.push({
          order: order++,
          line: bl.line,
          kind: 'kernel',
          label: `${bl.name} takes over`,
          detail: 'from here on, scheduling and every path in the image are live',
        })
      } else if (bl.role === 'env') {
        const [k, ...v] = bl.text.split('=')
        events.push({
          order,
          line: bl.line,
          kind: 'env',
          label: `${k} = ${v.join('=')}`,
        })
      }
    }
  }

  for (const entry of build.entries) {
    const attrs = attrLookup(entry.attrs)
    if (!attrs.has('script')) continue
    const parsed = parseScript(entry)
    for (const step of parsed.steps) {
      if (step.kind === 'env') {
        events.push({
          order: order++,
          line: step.line,
          kind: 'env',
          label: `${step.envKey} = ${step.envValue}`,
          detail: 'inherited by every process started after this line',
        })
        continue
      }

      if (step.name === 'reopen') {
        const path = step.argv[1] ?? '(missing)'
        consoleTimeline.push({ order, path })
        events.push({
          order: order++,
          line: step.line,
          kind: 'reopen',
          label: `console → ${path}`,
          detail: 'stdin/stdout/stderr of everything the script starts afterwards point here',
        })
        continue
      }

      if (step.name === 'display_msg' || step.name === 'procmgr_symlink' || step.name === 'waitfor') {
        events.push({
          order: order++,
          line: step.line,
          kind: 'note',
          label: step.name === 'display_msg' ? 'boot banner' : step.name,
          detail: step.argv.slice(1).join(' '),
        })
        continue
      }

      const prio = step.argv
        .find((a) => /^-P\d+$/.test(a))
        ?.slice(2)
      const provider = lookupProvider(step.name)
      const id = `p${processes.length}`
      const run: ProcessRun = {
        id,
        name: step.name,
        line: step.line,
        order,
        background: step.background,
        session: step.modifiers.includes('session'),
        prio: prio ? Number.parseInt(prio, 10) : undefined,
        provides: provider?.provides ?? [],
        blocking: !step.background,
        args: step.argv.slice(1).filter(isDevicePath),
      }
      processes.push(run)

      for (const path of run.provides) {
        if (!providedAt.has(path)) providedAt.set(path, order)
      }

      events.push({
        order: order++,
        line: step.line,
        kind: run.background ? 'start' : 'block',
        label: run.background ? `${run.name} starts` : `${run.name} runs in the foreground`,
        detail: run.background
          ? `${provider?.kind ?? 'process'}${run.session ? ' · its own session' : ''}`
          : 'the script waits here until it exits',
        processId: id,
      })
    }
  }

  return {
    events,
    processes,
    bootLines,
    console: consoleTimeline,
    providedAt,
    length: Math.max(order, 1),
  }
}

/** Order at which a concrete device path becomes available, if we can tell. */
export function availableOrder(replayResult: Replay, path: string): number | undefined {
  let best: number | undefined
  for (const [pattern, order] of replayResult.providedAt) {
    if (pathMatches(pattern, path)) {
      best = best === undefined ? order : Math.min(best, order)
    }
  }
  return best
}
