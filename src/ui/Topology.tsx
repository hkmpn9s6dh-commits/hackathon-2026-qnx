import { useEffect, useRef, useState } from 'react'
import type { Replay } from '../core/timeline'
import type { Finding } from '../core/rules'

interface Props {
  replay: Replay
  active: number
  findings: Finding[]
}

const CHIP_H = 44

/**
 * Processes alternate above and below the spine, so a ten-process image still
 * gets readable labels at laptop width. Pairs share an x position; the spine is
 * the time axis and the dot on it is when that process came alive.
 */
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
  const spineY = 146
  const perRow = Math.max(1, Math.ceil(procs.length / 2))
  const chipW = width < 700 ? 92 : 108
  const gap = Math.max(chipW + 14, Math.min(172, (width - 66 - chipW / 2 - 36) / perRow))
  const svgW = Math.max(width, 66 + perRow * gap + chipW / 2 + 36)

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

  const progressX = 66 + Math.min(Math.ceil(active / 2), perRow) * gap

  return (
    <div className="topology" ref={host} aria-label="Boot topology">
      <svg width={svgW} height={292} viewBox={`0 0 ${svgW} 292`} role="img">
        <title>Processes started during boot, in the order the script starts them</title>

        <line x1={66} y1={spineY} x2={svgW - 30} y2={spineY} stroke="var(--line-strong)" />
        <line x1={66} y1={spineY} x2={progressX} y2={spineY} stroke="var(--mint)" strokeOpacity={0.45} />

        <rect
          x={66 - 34}
          y={spineY - 14}
          width={68}
          height={28}
          rx="4"
          fill="rgba(242,179,61,.10)"
          stroke="var(--amber)"
        />
        <text x={66} y={spineY + 5} textAnchor="middle" fontFamily="var(--mono)" fontSize="12" fill="var(--amber)">
          procnto
        </text>
        <text x={66} y={spineY - 22} textAnchor="middle" fontFamily="var(--mono)" fontSize="9.5" fill="var(--faint)">
          kernel
        </text>

        {procs.map((p, i) => {
          const above = i % 2 === 0
          const x = 66 + (Math.floor(i / 2) + 1) * gap
          const chipTop = above ? spineY - 96 : spineY + 52
          const s = stateOf(p.order, p.line)
          const maxChars = chipW < 100 ? 10 : 13
          const name = p.name.length > maxChars ? `${p.name.slice(0, maxChars - 1)}…` : p.name

          return (
            <g key={p.id}>
              <line
                x1={x}
                y1={above ? chipTop + CHIP_H : chipTop}
                x2={x}
                y2={spineY}
                stroke={stroke(s)}
                strokeOpacity={0.5}
              />
              <circle cx={x} cy={spineY} r={3} fill={s === 'pending' ? 'var(--line-strong)' : stroke(s)} />

              <rect
                x={x - chipW / 2}
                y={chipTop}
                width={chipW}
                height={CHIP_H}
                rx="4"
                fill={fill(s)}
                stroke={stroke(s)}
                strokeWidth={s === 'current' ? 2 : 1}
              />
              <text
                x={x + chipW / 2 - 5}
                y={chipTop + 11}
                textAnchor="end"
                fontFamily="var(--mono)"
                fontSize="8.5"
                fill={warnLines.has(p.line) ? 'var(--amber)' : 'var(--faint)'}
                opacity={0.9}
              >
                {p.line}
              </text>
              <text x={x} y={chipTop + 24} textAnchor="middle" fontFamily="var(--mono)" fontSize="12" fill={label(s)}>
                {name}
              </text>
              <text x={x} y={chipTop + 36} textAnchor="middle" fontFamily="var(--mono)" fontSize="9.5" fill="var(--faint)">
                {p.background ? 'background' : 'foreground'}
                {p.session ? ' · session' : ''}
              </text>

              {p.provides.slice(0, 2).map((d, k) => (
                <text
                  key={d}
                  x={x}
                  y={(above ? chipTop - 24 : chipTop + CHIP_H + 15) + k * 14}
                  textAnchor="middle"
                  fontFamily="var(--mono)"
                  fontSize="10.5"
                  fill={s === 'pending' ? 'var(--faint)' : 'var(--mint)'}
                  opacity={s === 'pending' ? 0.6 : 0.95}
                >
                  {d}
                </text>
              ))}
            </g>
          )
        })}

        <text x={66} y={287} fontFamily="var(--mono)" fontSize="10" fill="var(--faint)">
          boot order, left to right · an ordering model, not a scheduler
        </text>
      </svg>

    </div>
  )
}
