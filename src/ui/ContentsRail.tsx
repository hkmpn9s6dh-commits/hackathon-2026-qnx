import type { BuildEntry } from '../core/types'
import { attrLookup } from '../core/types'

interface Props {
  entries: BuildEntry[]
  onGoto: (line: number) => void
}

function kindOf(entry: BuildEntry): { badge: string; pinned: boolean } {
  const attrs = attrLookup(entry.attrs)
  if (attrs.has('virtual')) return { badge: 'boot', pinned: true }
  if (attrs.has('script')) return { badge: 'script', pinned: true }
  if (attrs.get('type') === 'link') return { badge: 'link', pinned: false }
  if (entry.inline) return { badge: 'inline', pinned: false }
  return { badge: '', pinned: false }
}

function groupOf(entry: BuildEntry): string {
  if (!entry.target.startsWith('/')) return '/proc/boot'
  const parts = entry.target.split('/').filter(Boolean)
  return parts.length > 1 ? `/${parts[0]}` : '/'
}

export function ContentsRail({ entries, onGoto }: Props) {
  const pinned = entries.filter((e) => kindOf(e).pinned)
  const rest = entries.filter((e) => !kindOf(e).pinned)
  const groups = new Map<string, BuildEntry[]>()
  for (const e of rest) {
    const key = groupOf(e)
    const list = groups.get(key) ?? []
    list.push(e)
    groups.set(key, list)
  }
  const grouped = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)

  return (
    <nav className="rail" aria-label="Image contents">
      <h2>Image</h2>
      {pinned.map((e) => {
        const k = kindOf(e)
        return (
          <button key={e.index} className="rail-item pinned" onClick={() => onGoto(e.line)}>
            <span className="badge">{k.badge}</span>
            <span className="name">{e.target}</span>
            <span className="ln">{e.line}</span>
          </button>
        )
      })}

      <h2>Contents · {rest.length}</h2>
      {grouped.map(([dir, list]) => (
        <div key={dir}>
          <h3 className="rail-group">
            {dir}
            <span>{list.length}</span>
          </h3>
          {list.map((e) => {
            const k = kindOf(e)
            return (
              <button key={e.index} className="rail-item" onClick={() => onGoto(e.line)}>
                {k.badge ? <span className="badge">{k.badge}</span> : null}
                <span className="name">
                  {e.target}
                  {e.renamed && e.source ? ` ← ${e.source}` : ''}
                </span>
                <span className="ln">{e.line}</span>
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
