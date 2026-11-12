/**
 * Types shared by the parser, the resolver, the rule engine and the replay.
 *
 * The shapes here follow the QNX buildfile grammar as documented in
 * "Building Embedded Systems" (QNX SDP 8.0): an entry is
 *   optional_attributes filename optional_inline_contents
 */

export type Severity = 'error' | 'warning' | 'info'

export interface AttributeToken {
  /** `+name` → on, `-name` → off, `name=value` → value */
  kind: 'on' | 'off' | 'value'
  name: string
  value?: string
  raw: string
  line: number
}

export interface ParseIssue {
  line: number
  column: number
  message: string
  severity: Severity
}

export interface InlineFile {
  /** 1-based line number of the opening brace. */
  startLine: number
  /** 1-based line number of the closing brace. */
  endLine: number
  /** Raw lines between the braces (escapes not yet resolved). */
  rawLines: string[]
}

export interface BuildEntry {
  index: number
  /** 1-based line number where the entry starts. */
  line: number
  /** Attributes merged from every `[...]` group attached to this entry. */
  attrs: AttributeToken[]
  /** Destination path (left of `=`) or the filename. */
  target: string
  /** Source of a `dest=source` pair, when the entry renames or links. */
  source?: string
  /** True when the destination was written as `dest=source`. */
  renamed: boolean
  inline?: InlineFile
  /** The entry's own first line, verbatim. */
  raw: string
  quoted: boolean
}

export interface Buildfile {
  entries: BuildEntry[]
  issues: ParseIssue[]
  lines: string[]
}

export interface AttrLookup {
  has(name: string): boolean
  get(name: string): string | undefined
  getNumber(name: string): number | undefined
}

export function attrLookup(attrs: AttributeToken[]): AttrLookup {
  const on = new Set<string>()
  const off = new Set<string>()
  const values = new Map<string, string>()
  for (const a of attrs) {
    if (a.kind === 'on') on.add(a.name.toLowerCase())
    else if (a.kind === 'off') off.add(a.name.toLowerCase())
    else values.set(a.name.toLowerCase(), a.value ?? '')
  }
  return {
    has: (n) => {
      const k = n.toLowerCase()
      return (on.has(k) || values.has(k)) && !off.has(k)
    },
    get: (n) => values.get(n.toLowerCase()),
    getNumber: (n) => {
      const raw = values.get(n.toLowerCase())
      if (raw === undefined) return undefined
      const v = Number.parseInt(raw, 10)
      return Number.isNaN(v) ? undefined : v
    },
  }
}

/** Resolve `\{`, `\}` and `\\` inside an inline file, per the docs. */
export function inlineText(inline: InlineFile): string {
  return inline.rawLines
    .map((l) => l.replace(/\\([{}])/g, '$1').replace(/\\\\/g, '\\'))
    .join('\n')
}
