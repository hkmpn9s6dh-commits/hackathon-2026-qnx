import type { AttributeToken, BuildEntry, Severity } from './types'
import { attrLookup, inlineText } from './types'

export interface ScriptStep {
  index: number
  /** Line number in the .build file this step came from. */
  line: number
  raw: string
  kind: 'env' | 'command' | 'builtin'
  /** Command name, e.g. `devc-ser8250`, `reopen`. */
  name: string
  argv: string[]
  background: boolean
  modifiers: string[]
  /** Environment assignment target, when kind === 'env'. */
  envKey?: string
  envValue?: string
}

export interface ScriptParseIssue {
  line: number
  message: string
  severity: Severity
}

export interface ParsedScript {
  steps: ScriptStep[]
  issues: ScriptParseIssue[]
  env: Record<string, string>
}

const BUILTINS = new Set([
  'reopen',
  'display_msg',
  'procmgr_symlink',
  'waitfor',
  'sleep',
  'echo',
  'SYSNAME',
])

/** Split a command line into words, honouring double quotes. */
export function splitArgs(text: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && (ch === ' ' || ch === '\t')) {
      if (cur) out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur) out.push(cur)
  return out
}

function stripComment(line: string): string {
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === '#' && !inQuotes) {
      if (i === 0) return ''
      if (/\s/.test(line[i - 1]!)) return line.slice(0, i)
    }
  }
  return line
}

function takeModifiers(text: string): { modifiers: string[]; rest: string } {
  const modifiers: string[] = []
  let rest = text.trimStart()
  while (rest.startsWith('[')) {
    const close = rest.indexOf(']')
    if (close === -1) break
    const body = rest.slice(1, close).trim()
    for (const tok of body.split(/\s+/)) {
      if (tok) modifiers.push(tok.replace(/^\+/, ''))
    }
    rest = rest.slice(close + 1).trimStart()
  }
  return { modifiers, rest }
}

/**
 * Parse the contents of a `[+script]` entry. Line numbers are mapped back to
 * the enclosing .build file so a finding can point at the line to edit.
 */
export function parseScript(entry: BuildEntry): ParsedScript {
  const steps: ScriptStep[] = []
  const issues: ScriptParseIssue[] = []
  const env: Record<string, string> = {}

  if (!entry.inline) {
    return { steps, issues, env }
  }

  const body = inlineText(entry.inline).split('\n')
  let envPrefix: AttributeToken[] = []
  const baseLine = entry.inline.startLine

  body.forEach((rawLine, idx) => {
    const line = baseLine + 1 + idx
    const withoutComment = stripComment(rawLine)
    const trimmed = withoutComment.trim()
    if (!trimmed) return

    let { modifiers, rest } = takeModifiers(trimmed)
    if (!rest) {
      issues.push({
        line,
        message: 'modifier applied to nothing',
        severity: 'warning',
      })
      return
    }

    // Environment assignment: NAME=value, no spaces around '='.
    const envMatch = /^([A-Za-z_][A-Za-z0-9_]*)=(\S*)$/.exec(rest)
    if (envMatch) {
      const key = envMatch[1]!
      const value = envMatch[2]!
      env[key] = value
      steps.push({
        index: steps.length,
        line,
        raw: trimmed,
        kind: 'env',
        name: key,
        argv: [value],
        background: false,
        modifiers,
        envKey: key,
        envValue: value,
      })
      return
    }

    const background = rest.endsWith('&')
    if (background) rest = rest.slice(0, -1).trimEnd()
    const argv = splitArgs(rest)
    const name = argv[0] ?? ''
    if (!name) {
      issues.push({ line, message: 'empty command', severity: 'warning' })
      return
    }

    // `[+session] PATH=:/proc/boot esh &` — modifiers may be followed by an
    // env assignment and only then by the command.
    let cmdIndex = 0
    while (cmdIndex < argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[cmdIndex]!)) {
      const [k, ...v] = argv[cmdIndex]!.split('=')
      env[k!] = v.join('=')
      cmdIndex++
    }

    const finalName = argv[cmdIndex] ?? name
    steps.push({
      index: steps.length,
      line,
      raw: trimmed,
      kind: BUILTINS.has(finalName) && !argv[cmdIndex + 1]?.startsWith('/') ? 'builtin' : 'command',
      name: finalName,
      argv: argv.slice(cmdIndex),
      background,
      modifiers,
    })
    envPrefix = []
    void envPrefix
  })

  return { steps, issues, env }
}

export function entryScript(entry: BuildEntry): ParsedScript | null {
  const attrs = attrLookup(entry.attrs)
  if (!attrs.has('script')) return null
  return parseScript(entry)
}
