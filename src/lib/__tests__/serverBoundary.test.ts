/**
 * The payment functions stay on the host (N6.5). `src/server/` talks to
 * Stripe with a secret key; nothing the player's browser downloads may import
 * it, and the payment client the app does use loads only when payments are on.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as {
  readdirSync: (p: string, o: unknown) => { name: string; isDirectory(): boolean }[]
  readFileSync: (p: string, e: 'utf8') => string
}
const path = pathUntyped as { join: (...p: string[]) => string; relative: (a: string, b: string) => string }
declare const process: { cwd(): string }

const SRC = path.join(process.cwd(), 'src')
function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && full !== path.join(SRC, 'server')) files(full, out)
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(full)
  }
  return out
}

heading('The payment functions stay on the host')

const app = files(SRC)
note(`${app.length} modules the app can ship`)

check('no module the app ships imports from src/server', () => {
  const leaks = app.filter((f) => /from\s+['"][^'"]*\/server\/|import\(\s*['"][^'"]*\/server\//.test(fs.readFileSync(f, 'utf8')))
  assert(leaks.length === 0, `imports the server: ${leaks.map((f) => path.relative(SRC, f)).join(', ')}`)
})

check('the payment client is only ever loaded on demand', () => {
  const statics = app.filter((f) => /^import[^;]*from\s+['"][^'"]*billing\/client['"]/m.test(fs.readFileSync(f, 'utf8')))
  assert(statics.length === 0, `imports the payment client up front: ${statics.map((f) => path.relative(SRC, f)).join(', ')}`)
  const appFile = fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf8')
  // Read from the build itself, so a build without payments folds the import away.
  assert(
    /if \(!import\.meta\.env\.VITE_PAYMENTS \|\| PAYMENTS === 'off'\) return\s+void import\('\.\/lib\/billing\/client'\)/.test(appFile),
    'App loads the payment client without asking whether payments are on',
  )
})

check('no secret of the server is named in the app', () => {
  for (const f of app) {
    const text = fs.readFileSync(f, 'utf8')
    assert(!/STRIPE_SECRET_KEY|ENTITLEMENT_PRIVATE_JWK|sk_live_/.test(text), `${path.relative(SRC, f)} names a server secret`)
  }
})

report()
