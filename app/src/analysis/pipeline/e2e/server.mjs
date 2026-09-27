/**
 * Server for the pipeline end-to-end scripts (dev only).
 *
 *   mode 'prod'     (default) `vite build` with vite.prod.config.mjs, then `vite preview` on the port:
 *                   the production bundles, workers and asset paths the player's phone gets.
 *   mode 'dev'      `vite` (the dev server) on the port.
 *   mode 'external' nothing is started; a server must already listen on the port (the old behaviour).
 *
 * startE2EServer resolves once the page answers; stop() ends only the process it started.
 */
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '../../../..')
const viteBin = join(appRoot, 'node_modules/vite/bin/vite.js')
const prodConfig = join(here, 'vite.prod.config.mjs')
export const E2E_PAGE = '/src/analysis/pipeline/e2e/pipeline-e2e.html'

function run(args, { log }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [viteBin, ...args], { cwd: appRoot, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('error', reject)
    child.on('exit', (code) => {
      if (log) log(out.trim().split('\n').slice(-3).join('\n'))
      if (code === 0) resolvePromise(out)
      else reject(new Error(`vite ${args[0]} exited with ${code}:\n${out.slice(-4000)}`))
    })
  })
}

async function waitForPage(url, child, timeoutMs) {
  const until = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < until) {
    if (child && child.exitCode !== null) throw new Error(`server exited with ${child.exitCode} before answering`)
    try {
      const res = await fetch(url)
      if (res.ok) return
      lastError = `HTTP ${res.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`no answer from ${url} within ${timeoutMs} ms (${lastError})`)
}

/**
 * @param {{ mode?: 'prod' | 'dev' | 'external', port: number, log?: (line: string) => void, skipBuild?: boolean }} options
 * @returns {Promise<{ mode: string, base: string, stop: () => Promise<void>, buildMs: number }>}
 */
export async function startE2EServer({ mode = 'prod', port, log = console.log, skipBuild = false }) {
  const base = `http://localhost:${port}`
  if (mode === 'external') {
    await waitForPage(`${base}${E2E_PAGE}`, null, 10_000)
    return { mode, base, buildMs: 0, stop: async () => undefined }
  }
  let buildMs = 0
  if (mode === 'prod' && !skipBuild) {
    const started = Date.now()
    log(`building the production bundle (vite build, ${prodConfig})`)
    await run(['build', '--config', prodConfig, '--logLevel', 'warn'], { log })
    buildMs = Date.now() - started
    log(`built in ${(buildMs / 1000).toFixed(1)} s`)
  }
  const args = mode === 'prod' ? ['preview', '--config', prodConfig, '--port', String(port), '--strictPort'] : ['--port', String(port), '--strictPort']
  const child = spawn(process.execPath, [viteBin, ...args], { cwd: appRoot, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (d) => (output += d))
  child.stderr.on('data', (d) => (output += d))
  const stop = async () => {
    if (child.exitCode !== null) return
    child.kill()
    await new Promise((r) => {
      const timer = setTimeout(r, 3000)
      child.once('exit', () => {
        clearTimeout(timer)
        r()
      })
    })
  }
  try {
    await waitForPage(`${base}${E2E_PAGE}`, child, 60_000)
  } catch (error) {
    await stop()
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output.slice(-2000)}`)
  }
  log(`${mode === 'prod' ? 'vite preview (production build)' : 'vite dev server'} on ${base}`)
  return { mode, base, buildMs, stop }
}
