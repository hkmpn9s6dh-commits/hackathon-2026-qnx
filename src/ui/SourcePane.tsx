import { useEffect, useRef, useState } from 'react'
import type { Severity } from '../core/types'

interface Props {
  text: string
  onChange: (next: string) => void
  activeLine: number
  marks: Map<number, Severity>
}

const ROW = 22

export function SourcePane({ text, onChange, activeLine, marks }: Props) {
  const editor = useRef<HTMLTextAreaElement>(null)
  const gutter = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const lines = text.split('\n')

  // Only follow an *external* jump (a finding, the contents rail, the replay).
  // Re-selecting on every keystroke would make typing replace the line the
  // caret is on — which is exactly the bug this guard exists to prevent.
  const followed = useRef(-1)
  useEffect(() => {
    if (followed.current === activeLine) return
    followed.current = activeLine
    const el = editor.current
    if (!el) return
    const target = Math.max(0, (activeLine - 1) * ROW - 80)
    if (Math.abs(el.scrollTop - target) > ROW * 3) {
      el.scrollTop = target
      setScrollTop(el.scrollTop)
    }
    const start = lines.slice(0, activeLine - 1).join('\n').length + (activeLine > 1 ? 1 : 0)
    el.setSelectionRange(start, start + (lines[activeLine - 1]?.length ?? 0))
  }, [activeLine, lines])

  return (
    <div className="source">
      <div className="gutter" ref={gutter} aria-hidden="true">
        <div style={{ height: scrollTop, overflow: 'hidden' }} />
        {lines.map((_, i) => {
          const sev = marks.get(i + 1)
          const cls = i + 1 === activeLine ? 'mark-active' : sev === 'error' ? 'mark-err' : sev ? 'mark-warn' : ''
          return (
            <div key={i} className={cls}>
              {i + 1}
            </div>
          )
        })}
      </div>
      <div className="code-wrap">
        <div
          className="code-highlight on"
          style={{ top: 10 + (activeLine - 1) * ROW - scrollTop }}
        />
        <textarea
          ref={editor}
          className="editor"
          value={text}
          spellCheck={false}
          aria-label="Buildfile source"
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            const top = e.currentTarget.scrollTop
            setScrollTop(top)
            if (gutter.current) gutter.current.scrollTop = top
          }}
        />
      </div>
    </div>
  )
}
