#!/usr/bin/env node
/**
 * End-to-end checks against the built bundle, plus the screenshots the proof
 * folder and the demo video are made from.
 *
 * Usage: node scripts/e2e.mjs [--url http://127.0.0.1:4173/]
 * Exits non-zero on the first failed assertion.
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { join } from 'node:path'

const url = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://127.0.0.1:4173/'

const exe = join(
  homedir(),
  'AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',
)

const out = fileURLToPath(new URL('../proof/shots/', import.meta.url))
mkdirSync(out, { recursive: true })

let failures = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
}

const browser = await chromium.launch({ executablePath: exe })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

const requests = []
page.on('request', (r) => {
  const u = r.url()
  if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:') && !u.startsWith('blob:')) {
    requests.push(u)
  }
})

await page.goto(url, { waitUntil: 'networkidle' })

// AC-14: nothing leaves the page
check('no third-party network requests', requests.length === 0, requests.join(' '))

// AC-11: error pill reflects the sample
const errors = await page.locator('.pill.err b').innerText()
check('console-dark sample reports 3 errors', errors === '3', `found ${errors}`)

// AC-11: clicking a finding moves the source and marks the line
await page.locator('.finding').filter({ hasText: 'before its driver starts' }).first().click()
await page.waitForTimeout(150)
const activeLine = await page.evaluate(() => {
  const ta = document.querySelector('.editor')
  const pos = ta.selectionStart ?? 0
  return ta.value.slice(0, pos).split('\n').length
})
check('finding click highlights its line', activeLine === 17, `line ${activeLine}`)

// AC-12: the replay scrubs
const before = await page.locator('.replay-label').innerText()
await page.locator('.track').click({ position: { x: 600, y: 17 } })
await page.waitForTimeout(200)
const after = await page.locator('.replay-label').innerText()
check('scrubbing the timeline changes the step', before !== after, `${before} → ${after}`)

// AC-13: editing re-analyses live
await page.evaluate(() => {
  const ta = document.querySelector('.editor')
  const next = `${ta.value}\n/usr/lib/ldqnx-64.so.2=ldqnx-64.so.2\n`
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  ).set
  setter.call(ta, next)
  ta.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(250)
const afterEdit = await page.locator('.pill.err b').innerText()
check('fixing the loader drops one error', afterEdit === '2', `found ${afterEdit}`)

// screenshots
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.screenshot({ path: join(out, 'main.png') })

await page.locator('.finding').filter({ hasText: 'before its driver starts' }).first().click()
await page.waitForTimeout(400)
await page.screenshot({ path: join(out, 'finding-selected.png') })

await page.locator('.sample-select').selectOption('minimal')
await page.waitForTimeout(400)
await page.screenshot({ path: join(out, 'clean-image.png') })

await browser.close()
console.log(failures === 0 ? '\nall e2e checks passed' : `\n${failures} e2e check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
