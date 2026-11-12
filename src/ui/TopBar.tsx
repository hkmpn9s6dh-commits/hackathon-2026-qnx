import { useRef } from 'react'
import type { Severity } from '../core/types'
import { SAMPLES } from '../data/samples'

interface Props {
  fileName: string
  counts: Record<Severity, number>
  filter: Severity | 'all'
  onFilter: (s: Severity | 'all') => void
  onOpen: (text: string, name: string) => void
  onSample: (id: string) => void
  playing: boolean
  onTogglePlay: () => void
}

export function TopBar({
  fileName,
  counts,
  filter,
  onFilter,
  onOpen,
  onSample,
  playing,
  onTogglePlay,
}: Props) {
  const input = useRef<HTMLInputElement>(null)

  return (
    <header className="bar">
      <div className="wordmark">BOOTPRINT</div>

      <select
        className="sample-select"
        aria-label="Sample images"
        value={SAMPLES.find((s) => s.label === fileName)?.id ?? ''}
        onChange={(e) => onSample(e.target.value)}
      >
        <option value="" disabled>
          {fileName}
        </option>
        {SAMPLES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label} — {s.note}
          </option>
        ))}
      </select>

      <button className="file-btn" onClick={() => input.current?.click()}>
        Open .build
      </button>
      <input
        ref={input}
        type="file"
        accept=".build,.bld,text/plain"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          onOpen(await file.text(), file.name)
          e.target.value = ''
        }}
      />

      <div className="spacer" />

      <button
        className={`pill err ${filter === 'error' ? 'active' : ''}`}
        onClick={() => onFilter(filter === 'error' ? 'all' : 'error')}
        aria-pressed={filter === 'error'}
      >
        <b>{counts.error}</b> error{counts.error === 1 ? '' : 's'}
      </button>
      <button
        className={`pill warn ${filter === 'warning' ? 'active' : ''}`}
        onClick={() => onFilter(filter === 'warning' ? 'all' : 'warning')}
        aria-pressed={filter === 'warning'}
      >
        <b>{counts.warning}</b> warning{counts.warning === 1 ? '' : 's'}
      </button>
      <button
        className={`pill info ${filter === 'info' ? 'active' : ''}`}
        onClick={() => onFilter(filter === 'info' ? 'all' : 'info')}
        aria-pressed={filter === 'info'}
      >
        <b>{counts.info}</b> note{counts.info === 1 ? '' : 's'}
      </button>

      <button className="replay-btn" onClick={onTogglePlay} aria-pressed={playing}>
        {playing ? 'Pause' : 'Replay boot'}
      </button>
    </header>
  )
}
