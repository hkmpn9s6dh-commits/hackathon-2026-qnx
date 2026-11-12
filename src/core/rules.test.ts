import { describe, expect, it } from 'vitest'
import { parseBuildfile } from './parse'
import { analyze } from './rules'
import { parseScript } from './script'
import { readFileSync } from 'node:fs'

const read = (name: string) =>
  readFileSync(new URL(`../data/samples/${name}`, import.meta.url), 'utf8')

const minimal = read('minimal-x86_64.build')
const consoleDark = read('console-dark.build')
const trimmed = read('trimmed-image.build')
const sCore = read('s-core-init.build')

const rulesOf = (text: string) => analyze(parseBuildfile(text)).findings.map((f) => f.rule)

describe('boot script parsing', () => {
  it('separates environment, background and session', () => {
    const b = parseBuildfile(minimal)
    const entry = b.entries.find((e) => e.attrs.some((a) => a.name === 'script'))!
    const script = parseScript(entry)
    const devc = script.steps.find((s) => s.name === 'devc-ser8250' && s.kind === 'command')
    expect(devc?.background).toBe(true)
    expect(script.env.SYSNAME).toBe('nto')
    const sh = script.steps.find((s) => s.name === 'sh')
    expect(sh?.modifiers).toContain('session')
  })

  it('maps script lines back to the buildfile', () => {
    const b = parseBuildfile(minimal)
    const entry = b.entries.find((e) => e.attrs.some((a) => a.name === 'script'))!
    const script = parseScript(entry)
    const line = script.steps[0]!.line
    expect(b.lines[line - 1]).toMatch(/display_msg/)
  })
})

describe('rules on real and synthetic images', () => {
  it('passes the documented minimal image with no errors', () => {
    const result = analyze(parseBuildfile(minimal))
    expect(result.counts.error).toBe(0)
  })

  it('catches a console redirected before its driver', () => {
    const text = ['[virtual=x86_64,bios] boot = {', 'startup-x86 -v', 'PATH=/proc/boot', 'procnto', '}',
      '[+script] s = {', 'reopen /dev/ser1', 'devc-ser8250 &', '}', 'libc.so', '/usr/lib/ldqnx-64.so.2=ldqnx-64.so.2'].join('\n')
    const findings = analyze(parseBuildfile(text)).findings
    const hit = findings.find((f) => f.rule === 'reopen-before-driver')
    expect(hit).toBeDefined()
    expect(hit!.line).toBe(7)
  })

  it('accepts waitfor before reopen', () => {
    const text = ['[virtual=x86_64,bios] boot = {', 'startup-x86 -v', 'PATH=/proc/boot', 'procnto', '}',
      '[+script] s = {', 'devc-ser8250 &', 'waitfor /dev/ser1', 'reopen /dev/ser1', '}', 'libc.so',
      '/usr/lib/ldqnx-64.so.2=ldqnx-64.so.2'].join('\n')
    expect(rulesOf(text)).not.toContain('reopen-before-driver')
  })

  it('finds the dead console and the missing loader in the broken sample', () => {
    const rules = rulesOf(consoleDark)
    expect(rules).toContain('reopen-before-driver')
    expect(rules).toContain('no-dynamic-linker')
    expect(rules).toContain('shell-without-session')
  })

  it('finds the duplicated path and the wrong-width loader', () => {
    const rules = rulesOf(trimmed)
    expect(rules).toContain('duplicate-target')
    expect(rules).toContain('linker-width-mismatch')
  })

  it('finds a dangling symlink in a real, in-the-wild buildfile', () => {
    const findings = analyze(parseBuildfile(sCore)).findings
    const dangling = findings.filter((f) => f.rule === 'dangling-link')
    expect(dangling.length).toBeGreaterThanOrEqual(1)
    expect(dangling.map((f) => f.detail).join(' ')).toContain('/tmp_ram')
  })
})
