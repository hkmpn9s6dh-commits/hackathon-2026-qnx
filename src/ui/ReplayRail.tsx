import type { Replay, ReplayEvent } from '../core/timeline'

interface Props {
  replay: Replay
  active: number
  onScrub: (order: number) => void
  brokenAt: number | null
}

const KIND_LABEL: Record<string, string> = {
  boot: 'image',
  startup: 'startup',
  kernel: 'kernel',
  start: 'spawn',
  block: 'blocked',
  reopen: 'console',
  env: 'env',
  note: 'script',
}

const detailFor = (e: ReplayEvent | undefined): string => {
  if (!e) return 'Step through the boot to see what is alive at each line.'
  if (e.kind === 'boot') return 'The boot loader hands this image to the startup binary.'
  if (e.kind === 'startup') return e.detail ?? ''
  if (e.kind === 'kernel') return e.detail ?? ''
  if (e.kind === 'env') return e.detail ?? ''
  if (e.kind === 'reopen') return e.detail ?? ''
  if (e.kind === 'note') return e.detail ?? ''
  if (e.kind === 'block') return 'The script waits here. Nothing below this line runs until it exits.'
  return e.detail ?? ''
}

export function ReplayRail({ replay, active, onScrub, brokenAt }: Props) {
  const steps = replay.events
  const n = Math.max(steps.length, 1)
  const pct = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * 100)
  const current = steps.find((s) => s.order === active)

  const scrubFrom = (clientX: number, rect: DOMRect) => {
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const idx = Math.round(ratio * (n - 1))
    onScrub(steps[idx]?.order ?? 0)
  }

  return (
    <section className="replay" aria-label="Boot replay">
      <div className="replay-head">
        <span className={`event-kind k-${current?.kind ?? 'boot'}`}>
          {KIND_LABEL[current?.kind ?? 'boot']}
        </span>
        <span className="replay-label">{current?.label ?? 'Before the board is powered'}</span>
        <span className="replay-meta">{current ? `line ${current.line}` : 'header only'}</span>
        <span className="step-badge">
          {String(active + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
        </span>
      </div>

      <div
        className="track"
        role="slider"
        tabIndex={0}
        aria-label="Boot step"
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={active}
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          scrubFrom(e.clientX, rect)
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 1) return
          scrubFrom(e.clientX, e.currentTarget.getBoundingClientRect())
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onScrub(Math.min(n - 1, active + 1))
          if (e.key === 'ArrowLeft') onScrub(Math.max(0, active - 1))
        }}
      >
        <div className="track-rail" />
        {brokenAt !== null && (
          <>
            <div className="track-dead" style={{ left: `${pct(brokenAt)}%`, width: `${100 - pct(brokenAt)}%` }} />
            <div className="break-mark" style={{ left: `${pct(brokenAt)}%` }} />
            <div
              className={`break-label ${pct(brokenAt) < 22 ? 'right' : 'left'}`}
              style={{ left: `${pct(brokenAt)}%` }}
            >
              console dies here
            </div>
          </>
        )}
        <div className="track-fill" style={{ width: `${pct(active)}%` }} />
        {steps.map((s) => (
          <div
            key={s.order}
            className={`tick ${s.order <= active ? 'done' : ''} ${s.kind === 'block' ? 'err' : ''}`}
            style={{ left: `${pct(s.order)}%` }}
          />
        ))}
        <div className={`cursor ${brokenAt !== null && active >= brokenAt ? 'dead' : ''}`} style={{ left: `${pct(active)}%` }} />
      </div>

      <p className="replay-detail">{detailFor(current)}</p>
    </section>
  )
}
