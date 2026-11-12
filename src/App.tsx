import { useCallback, useEffect, useMemo, useState } from 'react'
import { parseBuildfile } from './core/parse'
import { analyze, type Finding } from './core/rules'
import type { Severity } from './core/types'
import { SAMPLES } from './data/samples'
import { TopBar } from './ui/TopBar'
import { ContentsRail } from './ui/ContentsRail'
import { ReplayRail } from './ui/ReplayRail'
import { Topology } from './ui/Topology'
import { SourcePane } from './ui/SourcePane'
import { FindingsRail } from './ui/FindingsRail'

const STEP_MS = 520

export default function App() {
  const [fileName, setFileName] = useState(SAMPLES[0]!.label)
  const [text, setText] = useState(SAMPLES[0]!.text)
  const [filter, setFilter] = useState<Severity | 'all'>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [activeLine, setActiveLine] = useState(1)
  const [activeStep, setActiveStep] = useState(0)
  const [playing, setPlaying] = useState(false)

  const build = useMemo(() => parseBuildfile(text), [text])
  const analysis = useMemo(() => analyze(build), [build])
  const { findings, replay, counts } = analysis

  const shown = filter === 'all' ? findings : findings.filter((f) => f.severity === filter)

  // The step where the console dies: everything after it prints into nothing.
  const deadFinding = findings.find((f) => f.rule === 'reopen-before-driver')
  const deadEvent = deadFinding
    ? replay.events.filter((e) => e.line === deadFinding.line && e.kind === 'reopen')[0]
    : undefined

  const marks = useMemo(() => {
    const m = new Map<number, Severity>()
    for (const f of findings) {
      const prev = m.get(f.line)
      if (!prev || (prev === 'info' && f.severity !== 'info')) m.set(f.line, f.severity)
    }
    return m
  }, [findings])

  useEffect(() => {
    if (activeStep > replay.length - 1) setActiveStep(Math.max(0, replay.length - 1))
  }, [replay.length, activeStep])

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      setActiveStep((s) => {
        if (s >= replay.length - 1) {
          setPlaying(false)
          return s
        }
        const next = s + 1
        const ev = replay.events.find((e) => e.order === next)
        if (ev) setActiveLine(ev.line)
        return next
      })
    }, STEP_MS)
    return () => window.clearInterval(id)
  }, [playing, replay])

  const scrub = useCallback(
    (order: number) => {
      setPlaying(false)
      setActiveStep(order)
      const ev = replay.events.find((e) => e.order === order)
      if (ev) setActiveLine(ev.line)
    },
    [replay],
  )

  const pickFinding = (f: Finding) => {
    setSelected(`${f.rule}-${f.line}-${findings.indexOf(f)}`)
    setActiveLine(f.line)
    const ev = replay.events.filter((e) => e.line === f.line).at(-1)
    if (ev) setActiveStep(ev.order)
  }

  const gotoLine = (line: number) => {
    setActiveLine(line)
    const ev = replay.events.filter((e) => e.line === line).at(-1)
    if (ev) setActiveStep(ev.order)
  }

  const arch =
    build.entries
      .find((e) => e.attrs.some((a) => a.name === 'virtual'))
      ?.attrs.find((a) => a.name === 'virtual')
      ?.value?.split(',')[0] ?? 'unknown target'

  return (
    <div className="app">
      <TopBar
        fileName={fileName}
        counts={counts}
        filter={filter}
        onFilter={setFilter}
        onOpen={(t, name) => {
          setText(t)
          setFileName(name)
          setActiveStep(0)
          setActiveLine(1)
          setSelected(null)
          setPlaying(false)
        }}
        onSample={(id) => {
          const s = SAMPLES.find((x) => x.id === id)
          if (!s) return
          setText(s.text)
          setFileName(s.label)
          setActiveStep(0)
          setActiveLine(1)
          setSelected(null)
          setPlaying(false)
        }}
        playing={playing}
        onTogglePlay={() => {
          if (!playing && activeStep >= replay.length - 1) setActiveStep(0)
          setPlaying((p) => !p)
        }}
      />

      <ContentsRail entries={build.entries} onGoto={gotoLine} />

      <main className="centre">
        <ReplayRail
          replay={replay}
          active={activeStep}
          onScrub={scrub}
          brokenAt={deadEvent ? deadEvent.order : null}
        />
        <Topology replay={replay} active={activeStep} findings={findings} />
        <SourcePane text={text} onChange={setText} activeLine={activeLine} marks={marks} />
      </main>

      <FindingsRail findings={shown} selected={selected} onSelect={pickFinding} />

      <footer className="status">
        <span>
          <span className="dot" />
          offline · nothing leaves this page
        </span>
        <span>{build.entries.length} entries</span>
        <span>{replay.processes.length} processes</span>
        <span>{arch}</span>
        <span>{build.issues.length} parse notes</span>
        <span style={{ marginLeft: 'auto' }}>{fileName}</span>
      </footer>
    </div>
  )
}
