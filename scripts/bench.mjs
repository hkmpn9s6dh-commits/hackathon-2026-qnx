#!/usr/bin/env node
/**
 * AC-10: a 600-line buildfile must analyse in under 100 ms on this laptop.
 * The budget is deliberately loose; the point is to catch an accidental
 * quadratic in the resolver, not to win a benchmark.
 */
import { parseBuildfile } from '../src/core/parse.ts'
import { analyze } from '../src/core/rules.ts'

const commands = Array.from({ length: 150 }, (_, i) =>
  i % 5 === 0 ? `svc-${i} /dev/ser1` : `svc-${i} &`,
)
const files = Array.from({ length: 500 }, (_, i) => `lib-module-${i}.so`)

const text = [
  '[image=0x800000]',
  '[virtual=x86_64,multiboot +compress] boot = {',
  '    startup-x86 -v',
  '    PATH=/proc/boot',
  '    procnto-smp-instr',
  '}',
  '',
  '[+script] startup-script = {',
  '    display_msg synthetic 600-line image',
  '    SYSNAME=nto',
  '    TERM=qansi',
  '    devc-ser8250 &',
  '    waitfor /dev/ser1',
  '    reopen /dev/ser1',
  ...commands.map((c) => `    ${c}`),
  '}',
  '',
  '[type=link] /tmp=/dev/shmem',
  '[type=link] /bin/sh=/proc/boot/ksh',
  'libc.so',
  '/usr/lib/ldqnx-64.so.2=ldqnx-64.so.2',
  'ksh',
  ...files,
].join('\n')

const lines = text.split('\n').length
const runs = 30
const t0 = performance.now()
for (let i = 0; i < runs; i++) {
  analyze(parseBuildfile(text))
}
const perRun = (performance.now() - t0) / runs

console.log(`   ${lines} lines · ${perRun.toFixed(1)} ms per analyse (budget 100 ms)`)
if (lines < 600) {
  console.log('   FAIL  fixture is shorter than 600 lines')
  process.exit(1)
}
if (perRun > 100) {
  console.log('   FAIL  over budget')
  process.exit(1)
}
