import { describe, expect, it } from 'vitest'
import { parseBuildfile } from './parse'
import { inlineText } from './types'

describe('parseBuildfile', () => {
  it('reads an inline boot image and keeps its line numbers', () => {
    const text = ['[virtual=x86_64,bios] boot = {', '  startup-x86 -v', '  procnto', '}', 'echo'].join(
      '\n',
    )
    const b = parseBuildfile(text)
    expect(b.entries).toHaveLength(2)
    const boot = b.entries[0]!
    expect(boot.target).toBe('boot')
    expect(boot.inline?.startLine).toBe(1)
    expect(boot.inline?.endLine).toBe(4)
    expect(inlineText(boot.inline!)).toContain('startup-x86 -v')
  })

  it('treats a group on its own line as a default for later entries', () => {
    const b = parseBuildfile(['[image=0x400000]', 'libc.so', 'echo'].join('\n'))
    expect(b.entries.map((e) => e.target)).toEqual(['libc.so', 'echo'])
    expect(b.entries[1]!.attrs.some((a) => a.name === 'image')).toBe(true)
  })

  it('does not leak an inline attribute group onto the next entry', () => {
    const text = ['[type=link] /tmp=/dev/shmem', 'libc.so'].join('\n')
    const b = parseBuildfile(text)
    const libc = b.entries[1]!
    expect(libc.attrs.some((a) => a.name === 'type')).toBe(false)
  })

  it('splits dest=source pairs', () => {
    const b = parseBuildfile('/usr/lib/ldqnx-64.so.2=ldqnx-64.so.2')
    expect(b.entries[0]!.target).toBe('/usr/lib/ldqnx-64.so.2')
    expect(b.entries[0]!.source).toBe('ldqnx-64.so.2')
    expect(b.entries[0]!.renamed).toBe(true)
  })

  it('keeps # inside an inline script but drops trailing comments', () => {
    const text = ['[+script] s = {', '  devc-ser8250 &   # serial', '  echo "# not a comment"', '}'].join(
      '\n',
    )
    const b = parseBuildfile(text)
    expect(b.entries[0]!.inline!.rawLines).toHaveLength(2)
  })

  it('reports an unclosed inline file instead of swallowing the rest silently', () => {
    const b = parseBuildfile(['[+script] s = {', '  echo hi'].join('\n'))
    expect(b.issues.some((i) => /never closed/.test(i.message))).toBe(true)
  })

  it('flags a group with no filename', () => {
    const b = parseBuildfile('[+script] = {\n}\n')
    expect(b.issues.some((i) => i.severity === 'error')).toBe(true)
  })
})
