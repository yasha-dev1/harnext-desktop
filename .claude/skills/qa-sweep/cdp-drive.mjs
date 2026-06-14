/* eslint-disable */
/**
 * No-MCP CDP driver for the harnext-desktop renderer. Connects to Electron's
 * remote-debugging port (default 9222), reloads the app, walks the onboarding
 * flow, and reports console errors / exceptions / failed requests + assertions.
 *
 * Requires `chrome-remote-interface` (install anywhere and point NODE_PATH at it):
 *   npm install --prefix /tmp/qa-cdp chrome-remote-interface
 *   NODE_PATH=/tmp/qa-cdp/node_modules node .claude/skills/qa-sweep/cdp-drive.mjs
 *
 * Screenshots land in qa-reports/assets/. Prints a JSON summary on stdout.
 */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const CDP = require('chrome-remote-interface')

const PORT = Number(process.env.QA_CDP_PORT || 9222)
const ASSETS = process.env.QA_ASSETS || 'qa-reports/assets'
mkdirSync(ASSETS, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = { console: [], exceptions: [], netFails: [], steps: [], checks: {} }

const client = await CDP({ port: PORT })
const { Runtime, Page, Log, Network } = client

Log.entryAdded(({ entry }) => {
  if (entry.level === 'error' || entry.level === 'warning')
    out.console.push({ level: entry.level, text: entry.text, url: entry.url })
})
Runtime.consoleAPICalled((e) => {
  if (e.type === 'error' || e.type === 'warning')
    out.console.push({
      level: e.type,
      text: e.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)
    })
})
Runtime.exceptionThrown((p) =>
  out.exceptions.push((p.exceptionDetails.exception?.description || p.exceptionDetails.text || '').slice(0, 300))
)
Network.loadingFailed((p) => {
  if (!/net::ERR_ABORTED/.test(p.errorText || '')) out.netFails.push(p.errorText)
})

await Promise.all([Runtime.enable(), Page.enable(), Log.enable(), Network.enable()])

async function ev(expression, awaitPromise = false) {
  const { result, exceptionDetails } = await Runtime.evaluate({
    expression,
    awaitPromise,
    returnByValue: true
  })
  if (exceptionDetails) return { error: exceptionDetails.exception?.description || exceptionDetails.text }
  return { value: result.value }
}
async function shot(name) {
  const { data } = await Page.captureScreenshot({ format: 'png' })
  writeFileSync(`${ASSETS}/${name}.png`, Buffer.from(data, 'base64'))
  return `${ASSETS}/${name}.png`
}
const clickText = (text) =>
  ev(
    `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().includes(${JSON.stringify(
      text
    )}));if(b){b.click();return true}return false})()`
  )
async function step(label, fn) {
  const before = out.console.length
  const r = await fn()
  out.steps.push({ label, result: r, newConsole: out.console.length - before })
}

// Fresh load so we capture the full load console.
await Page.reload({ ignoreCache: true })
await sleep(2500)

// ── smoke ────────────────────────────────────────────────────────────
out.checks.windowApi = (await ev('typeof window.api')).value
out.checks.title = (await ev('document.title')).value
out.checks.hash = (await ev('location.hash')).value
out.checks.appearance = (await ev('document.documentElement.dataset.appearance')).value
out.checks.onboarded = (await ev('await window.api.settings.get().then(s=>s.onboarded)', true)).value
out.checks.providersCount = (await ev('await window.api.providers.list().then(p=>p.length)', true)).value
out.checks.bodyText = (await ev('document.body.innerText.replace(/\\s+/g," ").slice(0,180)')).value
await step('welcome-screenshot', () => shot('onb-1-welcome'))

// ── onboarding walk ──────────────────────────────────────────────────
await step('click Get started', () => clickText('Get started'))
await sleep(600)
await step('theme-screenshot', () => shot('onb-2-theme'))
await step('toggle Light', async () => {
  await clickText('Light')
  await sleep(300)
  return (await ev('document.documentElement.dataset.appearance')).value
})
await step('toggle Dark', async () => {
  await clickText('Dark')
  await sleep(300)
  return (await ev('document.documentElement.dataset.appearance')).value
})
await step('click Continue (theme)', () => clickText('Continue'))
await sleep(600)
await step('provider-screenshot', () => shot('onb-3-provider'))
out.checks.providerButtons = (await ev("document.querySelectorAll('.prov').length")).value
await step('click Continue (provider, empty key)', () => clickText('Continue'))
await sleep(600)
await step('project-screenshot', () => shot('onb-4-project'))
await step('click Skip setup', () => clickText('Skip setup'))
await sleep(800)
out.checks.afterSkipHash = (await ev('location.hash')).value
out.checks.onboardedAfter = (await ev('await window.api.settings.get().then(s=>s.onboarded)', true)).value
await step('home-screenshot', () => shot('onb-5-home'))

await client.close()
console.log(JSON.stringify(out, null, 2))
