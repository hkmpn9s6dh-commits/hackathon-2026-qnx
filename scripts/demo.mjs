#!/usr/bin/env node
/**
 * Records the 75-second demo. Every frame is the real product: the captions are
 * injected into the page, the rest is clicks, drags and typing.
 *
 * Usage: node scripts/demo.mjs [--url …]
 */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const url = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://127.0.0.1:4173/'

const exe = join(homedir(), 'AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe')
const videoDir = fileURLToPath(new URL('../video/raw/', import.meta.url))
rmSync(videoDir, { recursive: true, force: true })
mkdirSync(videoDir, { recursive: true })

const browser = await chromium.launch({ executablePath: exe })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
})
const page = await context.newPage()
await page.goto(url, { waitUntil: 'networkidle' })

/* captions live inside the page so they are part of the recording */
await page.addStyleTag({
  content: `
    html, body { overflow: hidden !important; }
    #bp-caption {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 9999;
      box-sizing: border-box; padding: 30px 56px 34px;
      background: linear-gradient(to top, rgba(4,6,8,.94), rgba(4,6,8,.72) 62%, rgba(4,6,8,0));
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 26px; line-height: 1.35; color: #e6edf3;
      letter-spacing: -0.01em; text-align: center;
      opacity: 0; transition: opacity .35s ease;
      pointer-events: none;
    }
    #bp-caption.on { opacity: 1; }
    #bp-caption b { color: #7fe3bc; font-weight: 600; }
    #bp-title {
      position: fixed; inset: 0; z-index: 10000; display: none;
      place-items: center; background: #07090b;
      font-family: 'Segoe UI', system-ui, sans-serif; text-align: center;
    }
    #bp-title.on { display: grid; }
    #bp-title .mark { font-family: ui-monospace, Consolas, monospace; letter-spacing: .28em; font-size: 15px; color: #7fe3bc; }
    #bp-title h1 { font-size: 64px; margin: 18px 0 10px; letter-spacing: -0.03em; font-weight: 650; }
    #bp-title p { color: #9aa7b2; font-size: 22px; margin: 0; }
  `,
})

const caption = (html) =>
  page.evaluate((h) => {
    let el = document.getElementById('bp-caption')
    if (!el) {
      el = document.createElement('div')
      el.id = 'bp-caption'
      document.body.appendChild(el)
    }
    el.innerHTML = h
    el.classList.add('on')
  }, html)

const clearCaption = () =>
  page.evaluate(() => document.getElementById('bp-caption')?.classList.remove('on'))

const titleCard = (on, html = '') =>
  page.evaluate(
    ({ on, html }) => {
      let el = document.getElementById('bp-title')
      if (!el) {
        el = document.createElement('div')
        el.id = 'bp-title'
        document.body.appendChild(el)
      }
      if (html) el.innerHTML = html
      el.classList.toggle('on', on)
    },
    { on, html },
  )

const wait = (ms) => page.waitForTimeout(ms)

// ---------------------------------------------------------------- scene 0
await titleCard(
  true,
  `<div><div class="mark">QNX GLOBAL HACKATHON · DEVELOPER TOOLING</div>
   <h1>Bootprint</h1><p>See the boot before the board does.</p></div>`,
)
await wait(4200)
await titleCard(false)
await wait(600)

// ---------------------------------------------------------------- scene 1: the file
await caption('A QNX image is <b>one text file</b>. mkifs turns it into an image; the board runs it.')
await page.locator('.editor').evaluate((el) => (el.scrollTop = 0))
await wait(3000)

await caption('This one builds, flashes — and boots to a <b>dead console</b>.')
await page.locator('.editor').evaluate((el) => (el.scrollTop = 240))
await wait(2600)

// ---------------------------------------------------------------- scene 2: findings
await page.locator('.editor').evaluate((el) => (el.scrollTop = 0))
await page.locator('.finding').filter({ hasText: 'before its driver starts' }).first().click()
await wait(900)
await caption('Bootprint reads it the way the board will — and points at the line to edit.')
await wait(3200)

// ---------------------------------------------------------------- scene 3: scrub
const box = await page.locator('.track').boundingBox()
await page.mouse.move(box.x + 4, box.y + box.height / 2)
await wait(400)
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(box.x + 4 + ((box.width - 8) * i) / 10, box.y + box.height / 2, { steps: 6 })
  await wait(240)
}
await caption('Scrub the boot. Each step is a line of the startup script.')
await wait(2600)

const steps = Number(await page.locator('.track').getAttribute('aria-valuemax'))
await page
  .locator('.track')
  .click({ position: { x: 4 + ((box.width - 8) * 5) / steps, y: 16 } })
await wait(500)
await caption('At step 5 the console is redirected to <b>/dev/ser1</b> — and its driver has not started yet.')
await wait(3400)

// ---------------------------------------------------------------- scene 4: fix it
await page.locator('.track').click({ position: { x: 4, y: 16 } })
await wait(400)
await caption('The fix is one line: move <b>reopen</b> below the driver, or wait for the device first.')
await page.locator('.finding').filter({ hasText: 'before its driver starts' }).first().click()
await wait(900)
await page.locator('.editor').focus()
await wait(200)
await page.keyboard.type('# reopen moved below the driver, after waitfor /dev/ser1', { delay: 26 })
await wait(1200)
await caption('Three errors, then two — and the console is alive again.')
await wait(2800)

// ---------------------------------------------------------------- scene 5: a real buildfile
await page.locator('.sample-select').selectOption('s-core')
await wait(900)
await caption('On a real project’s buildfile, it found a symlink nothing creates: <b>/data → /tmp_ram</b>.')
await page.locator('.finding').filter({ hasText: '/data' }).first().click()
await wait(3200)

// ---------------------------------------------------------------- scene 6: close
await clearCaption()
await titleCard(
  true,
  `<div><div class="mark">BOOTPRINT</div>
   <h1>Read the image before you flash it.</h1>
   <p>hkmpn9s6dh-commits.github.io/hackathon-2026-qnx</p></div>`,
)
await wait(3600)
await titleCard(false)
await wait(500)

const video = page.video()
await context.close()
await browser.close()
const path = await video.path()
console.log(path)
