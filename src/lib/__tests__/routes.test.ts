/**
 * Every screen has an address, and every address the app hands out leads back
 * to the screen it named (N3.1). A link that opens the wrong place, or a blank
 * page, is the failure a website cannot afford and a phone app never had.
 */
// No @types/node; see egress.test.ts for why.
declare const process: { cwd(): string }
// @ts-expect-error no @types/node; see egress.test.ts.
import fsUntyped from 'fs'
// @ts-expect-error no @types/node; see egress.test.ts.
import pathUntyped from 'path'
import { INFO_PAGES, parsePath, pathFor, titleFor, type RoutedView } from '../routes'
import { SCREENS } from '../screenFlow'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

const fs: { readFileSync: (path: string, encoding: 'utf8') => string } = fsUntyped
const path: { join: (...parts: string[]) => string } = pathUntyped

const VIEWS: RoutedView[] = [
  { kind: 'home' },
  { kind: 'progress' },
  { kind: 'progress', serves: true },
  { kind: 'saved', session: { id: 'abc-123' } },
  { kind: 'saved', session: { id: 'x' }, example: true },
  { kind: 'session', session: { id: 'p 9/z' } },
  { kind: 'report' },
  { kind: 'analyzing' },
  { kind: 'glance' },
  { kind: 'error' },
  ...INFO_PAGES.map((page) => ({ kind: 'page' as const, page })),
]

heading('Every screen has an address (N3.1)')

check('every screen the app has is named here', () => {
  const kinds = new Set(VIEWS.map((v) => v.kind))
  for (const s of SCREENS) assert(kinds.has(s as RoutedView['kind']), `${s} has no address`)
})

check('an address the app hands out opens what it named, at the root and under a base', () => {
  for (const base of ['/', '/serve-coach/']) {
    for (const v of VIEWS) {
      const p = pathFor(v, base)
      assert(p.startsWith(base), `${p} is outside ${base}`)
      const r = parsePath(p, base)
      const want =
        v.kind === 'progress'
          ? v.serves
            ? 'serves'
            : 'progress'
          : v.kind === 'saved'
            ? v.example
              ? 'sample'
              : 'serve'
            : v.kind === 'session'
              ? 'practice'
              : v.kind === 'page'
                ? 'page'
                : 'home'
      assert(r.kind === want, `${p} opened ${r.kind}, wanted ${want}`)
      if (r.kind === 'page') assert(v.kind === 'page' && r.page === v.page, `${p} opened the wrong page`)
      if (r.kind === 'serve' || r.kind === 'practice') {
        assert(r.id === (v as { session: { id: string } }).session.id, `${p} lost its id: ${r.id}`)
      }
    }
  }
})

check('an address the app doesn’t know opens Today, never a blank page', () => {
  for (const p of ['/nope', '/serve', '/serve/', '/serve/a/b', '/practice', '/other-base/progress', '/progress/x', '/privacy/x', '/Accuracy']) {
    const r = parsePath(p, p.startsWith('/other') ? '/serve-coach/' : '/')
    assert(r.kind === 'home', `${p} opened ${r.kind}`)
  }
  assert(parsePath('/serve/%E0%A4%A', '/').kind === 'serve', 'a malformed escape should still open the serve route')
})

check('every screen titles its tab, and the title names the app', () => {
  for (const v of VIEWS) {
    const t = titleFor(v)
    assert(/\| Serve Coach$/.test(t), `${v.kind}: ${t}`)
  }
})

check('the PWA falls back to the page for an address it hasn’t cached', () => {
  // A deep link opened offline is a navigation the service worker must answer
  // with the app, or the installed app shows the browser's offline page.
  const config = fs.readFileSync(path.join(process.cwd(), 'vite.config.ts'), 'utf8')
  assert(!/navigateFallback:\s*(null|undefined|false)/.test(config), 'navigateFallback is switched off')
})

report()
