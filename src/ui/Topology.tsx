import { useEffect, useRef, useState } from 'react'
import type { Replay } from '../core/timeline'
import type { Finding } from '../core/rules'

interface Props {
  replay: Replay
  active: number
  findings: Finding[]
}

const CHIP_H = 44

export function Topology({ replay, active, findings }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(960)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(360, entry.contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const procs = replay.processes
  const kernelX = 66
  const gap = procs.length ? Math.min(138, Math.max(62, (width - kernelX - 84) / procs.length)) : 120
  const chipW = Math.max(54, Math.min(104, gap - 10))
  const svgW = Math.max(width, kernelX + procs.length * gap + 110)

  const spineY = 128
  const errorLines = new Set(findings.filter((f) => f.severity === 'error').map((f) => f.line))
  const warnLines = new Set(findings.filter((f) => f.severity === 'warning').map((f) => f.line))

  const stateOf = (order: number, line: number) => {
    if (errorLines.has(line)) return 'alarm'
    if (order > active) return 'pending'
    if (order === active) return 'current'
    return 'live'
  }

  const stroke = (s: string) =>
    s === 'alarm'
      ? 'var(--alarm)'
      : s === 'current'
        ? 'var(--mint)'
        : s === 'live'
          ? 'rgba(127,227,188,.4)'
          : 'var(--line-strong)'
  const fill = (s: string) =>
    s === 'alarm' ? 'rgba(255,107,107,.09)' : s === 'current' ? 'rgba(127,227,188,.12)' : 'rgba(255,255,255,.02)'
  const label = (s: string) =>
    s === 'alarm' ? 'var(--alarm)' : s === 'current' ? 'var(--mint)' : s === 'live' ? 'var(--text)' : 'var(--faint)'

  const consoleEvent = replay.events.find((e) => e.kind === 'reopen')
  const consolePath = consoleEvent ? consoleEvent.label.replace('console → ', '') : ''
  const consoleAlive = consoleEvent ? consoleEvent.order <= active : true
  const consoleBroken = consoleEvent
    ? findings.some((f) => f.rule === 'reopen-before-driver' && f.line === consoleEvent.line)
    : false

  const progressX = kernelX + Math.min(active, procs.length) * gap

  return (
    <div className="topology" ref={host} aria-label="Boot topology">
      <svg width={svgW} height={300} viewBox={`0 0 ${svgW} 300`} role="img">
        <title>Processes started during boot, in the order the script starts them</title>

        <line x1={kernelX} y1={spineY} x2={svgW - 40} y2={spineY} stroke="var(--line-strong)" />
        <line x1={kernelX} y1={spineY} x2={progressX} y2={spineY} stroke="var(--mint)" strokeOpacity={0.45} />

        <text x={kernelX} y={spineY - 36} textAnchor="middle" fontFamily="var(--mono)" fontSize="10" fill="var(--faint)">
          kernel
        </text>
        <rect
          x={kernelX - chipW / 2}
          y={spineY - CHIP_H / 2}
          width={chipW}
          height={CHIP_H}
          rx="4"
          fill="rgba(242,179,61,.10)"
          stroke="var(--amber)"
        />
        <text x={kernelX} y={spineY + 4} textAnchor="middle" fontFamily="var(--mono)" fontSize="12" fill="var(--amber)">
          procnto
        </text>

        {procs.map((p, i) => {
          const x = kernelX + (i + 1) * gap
          const s = stateOf(p.order, p.line)
          const maxChars = chipW < 80 ? 8 : 11
          const name = p.name.length > maxChars ? `${p.name.slice(0, maxChars - 1)}…` : p.name
          return (
            <g key={p.id}>
              <text
                x={x}
                y={spineY - 36}
                textAnchor="middle"
                fontFamily="var(--mono)"
                fontSize="10"
                fill={warnLines.has(p.line) ? 'var(--amber)' : 'var(--faint)'}
              >
                {p.line}
              </text>
              <rect
                x={x - chipW / 2}
                y={spineY - CHIP_H / 2}
                width={chipW}
                height={CHIP_H}
                rx="4"
                fill={fill(s)}
                stroke={stroke(s)}
                strokeWidth={s === 'current' ? 2 : 1}
              />
              <text x={x} y={spineY + 1} textAnchor="middle" fontFamily="var(--mono)" fontSize="11.5" fill={label(s)}>
                {name}
              </text>
              <text x={x} y={spineY + 14} textAnchor="middle" fontFamily="var(--mono)" fontSize="9" fill="var(--faint)">
                {p.background ? 'bg' : 'fg'}
                {p.session ? ' · session' : ''}
              </text>

              {p.provides.slice(0, 2).map((d, k) => (
                <g key={d}>
                  <line x1={x} y1={spineY + CHIP_H / 2} x2={x} y2={spineY + 54 + k * 20} stroke="var(--line)" />
                  <text
                    x={x}
                    y={spineY + 58 + k * 20}
                    textAnchor="middle"
                    fontFamily="var(--mono)"
                    fontSize="10"
                    fill={s === 'pending' ? 'var(--faint)' : 'var(--mint)'}
                    opacity={s === 'pending' ? 0.55 : 0.9}
                  >
                    {d}
                  </text>
                </g>
              ))}
            </g>
          )
        })}

        <text x={kernelX} y={288} fontFamily="var(--mono)" fontSize="10" fill="var(--faint)">
          boot order, left to right · an ordering model, not a scheduler
        </text>
      </svg>

      {consoleEvent && (
        <div className={`console-chip ${consoleBroken ? 'broken' : consoleAlive ? 'live' : ''}`}>
          <span className="console-key">console</span>
          <span className="console-path">{consolePath}</span>
          <span className="console-state">{consoleBroken ? 'dead on arrival' : consoleAlive ? 'open' : 'not yet'}</span>
        </div>
      )}
    </div>
  )
}
