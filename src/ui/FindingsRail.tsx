import type { Finding } from '../core/rules'

interface Props {
  findings: Finding[]
  selected: string | null
  onSelect: (f: Finding) => void
}

export function FindingsRail({ findings, selected, onSelect }: Props) {
  return (
    <aside className="findings" aria-label="Findings">
      <div className="findings-head">
        <span>Findings</span>
        <span style={{ marginLeft: 'auto', color: 'var(--dim)' }}>{findings.length}</span>
      </div>
      <div className="findings-list">
        {findings.length === 0 && (
          <p className="empty-note">
            Nothing to report. This image parses, resolves and boots in order — the checks that
            remain are the ones only hardware can answer.
          </p>
        )}
        {findings.map((f, i) => {
          const id = `${f.rule}-${f.line}-${i}`
          return (
            <button
              key={id}
              className="finding"
              aria-current={selected === id}
              onClick={() => onSelect(f)}
              data-line={f.line}
            >
              <div className="title">
                <span className={`sev ${f.severity === 'error' ? 'err' : f.severity === 'warning' ? 'warn' : 'info'}`}>
                  {f.severity}
                </span>
                <span>{f.title}</span>
              </div>
              <div className="detail">{f.detail}</div>
              <div className="foot">
                <span>line {f.line}</span>
                <span>{f.rule}</span>
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
