import type {
  AttributeToken,
  BuildEntry,
  Buildfile,
  InlineFile,
  ParseIssue,
} from './types'

interface GroupResult {
  tokens: AttributeToken[]
  /** Index just past the closing `]`. */
  end: number
  issues: ParseIssue[]
}

function parseGroup(line: string, lineNo: number, start: number): GroupResult {
  const tokens: AttributeToken[] = []
  const issues: ParseIssue[] = []
  let i = start + 1 // skip '['
  let token = ''
  let tokenStart = start + 1

  const flush = () => {
    const raw = token.trim()
    token = ''
    if (!raw) return
    if (raw.startsWith('+')) {
      tokens.push({ kind: 'on', name: raw.slice(1), raw, line: lineNo })
    } else if (raw.startsWith('-')) {
      tokens.push({ kind: 'off', name: raw.slice(1), raw, line: lineNo })
    } else if (raw.includes('=')) {
      const eq = raw.indexOf('=')
      tokens.push({
        kind: 'value',
        name: raw.slice(0, eq),
        value: raw.slice(eq + 1),
        raw,
        line: lineNo,
      })
    } else {
      tokens.push({ kind: 'on', name: raw, raw, line: lineNo })
    }
  }

  while (i < line.length) {
    const ch = line[i]!
    if (ch === ']') {
      flush()
      return { tokens, end: i + 1, issues }
    }
    if (ch === ' ' || ch === '\t') {
      if (token.trim()) {
        tokenStart = tokenStart // keep first token start
        flush()
      } else {
        token = ''
      }
      i++
      tokenStart = i
      continue
    }
    token += ch
    i++
  }

  issues.push({
    line: lineNo,
    column: start + 1,
    message: 'attribute group is never closed with “]”',
    severity: 'error',
  })
  flush()
  return { tokens: [], end: line.length, issues }
}

/** Split `dest=source` while respecting quotes. Returns null when there is no `=`. */
function splitPair(text: string): { dest: string; source: string } | null {
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === '=' && !inQuotes) {
      return { dest: text.slice(0, i), source: text.slice(i + 1) }
    }
  }
  return null
}

function unquote(text: string): { value: string; quoted: boolean } {
  const t = text.trim()
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return { value: t.slice(1, -1).replace(/\\"/g, '"'), quoted: true }
  }
  return { value: t, quoted: false }
}

/**
 * Parse a QNX buildfile (mkifs input) into entries, keeping line numbers so
 * findings can point back at the exact line a developer has to edit.
 *
 * Attribute groups written on their own line are global defaults and stay in
 * effect for every following entry (documented mkifs behaviour). Groups
 * written on the same line as a filename apply to that entry only.
 */
export function parseBuildfile(text: string): Buildfile {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const entries: BuildEntry[] = []
  const issues: ParseIssue[] = []
  const globals: AttributeToken[] = []

  let i = 0
  while (i < lines.length) {
    const lineNo = i + 1
    const raw = lines[i]!
    const trimmed = raw.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      i++
      continue
    }

    let scoped: AttributeToken[] = []
    let rest = ''
    let restOffset = 0

    if (trimmed.startsWith('[')) {
      const leading = raw.length - raw.trimStart().length
      const group = parseGroup(raw, lineNo, leading)
      issues.push(...group.issues)
      scoped = group.tokens
      rest = raw.slice(group.end).trim()
      restOffset = group.end

      // Group alone on its line → defaults for everything that follows.
      if (!rest) {
        globals.length = 0
        globals.push(...scoped)
        i++
        continue
      }
      i++
    } else {
      rest = trimmed
      restOffset = raw.length - raw.trimStart().length
      i++
    }

    // Trim trailing comment that is not inside a quoted filename.
    {
      let inQ = false
      for (let c = 0; c < rest.length; c++) {
        const ch = rest[c]!
        if (ch === '"') inQ = !inQ
        else if (ch === '#' && !inQ && c > 0 && /\s/.test(rest[c - 1]!)) {
          rest = rest.slice(0, c).trimEnd()
          break
        }
      }
    }

    const inlineMatch = /\s*=\s*\{$/.exec(rest)
    let head = rest
    let inline: InlineFile | undefined

    if (inlineMatch) {
      head = rest.slice(0, inlineMatch.index).trim()
      const openLine = lineNo
      const body: string[] = []
      let closed = false
      let j = i
      while (j < lines.length) {
        const candidate = lines[j]!
        if (candidate.trim() === '}') {
          closed = true
          break
        }
        body.push(candidate)
        j++
      }
      if (!closed) {
        issues.push({
          line: openLine,
          column: 1,
          message: 'inline file is never closed — expected a line containing only “}”',
          severity: 'error',
        })
      }
      inline = {
        startLine: openLine,
        endLine: closed ? j + 1 : lines.length,
        rawLines: body,
      }
      i = closed ? j + 1 : lines.length
    }

    if (!head) {
      issues.push({
        line: lineNo,
        column: restOffset + 1,
        message: 'attribute group has no filename to attach to',
        severity: 'error',
      })
      continue
    }

    const pair = splitPair(head)
    const dest = unquote(pair ? pair.dest : head)
    const src = pair ? unquote(pair.source) : undefined

    if (!dest.value) {
      issues.push({
        line: lineNo,
        column: restOffset + 1,
        message: 'entry has an empty destination name',
        severity: 'error',
      })
      continue
    }

    entries.push({
      index: entries.length,
      line: lineNo,
      attrs: [...globals, ...scoped],
      target: dest.value,
      source: src?.value,
      renamed: Boolean(pair),
      inline,
      raw,
      quoted: dest.quoted,
    })
  }

  // Global attributes that were replaced leave no trace, but an attribute
  // written twice on the same entry is worth a warning: mkifs merges them and
  // the later value silently wins.
  for (const entry of entries) {
    const seen = new Map<string, string>()
    for (const a of entry.attrs) {
      if (a.kind !== 'value') continue
      const prev = seen.get(a.name.toLowerCase())
      if (prev !== undefined && prev !== a.value) {
        issues.push({
          line: a.line,
          column: 1,
          message: `attribute “${a.name}” is set twice (${prev} → ${a.value}); the last one wins`,
          severity: 'warning',
        })
      }
      seen.set(a.name.toLowerCase(), a.value ?? '')
    }
  }

  return { entries, issues, lines }
}
