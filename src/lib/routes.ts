/**
 * A web address for every screen (N3.1).
 *
 * The app still keeps its screen in React state and the back gesture in
 * `backStack.ts`; this module only says which address a screen lives at, and
 * which screen an address asks for. So a link to Progress or to one stored serve
 * works when pasted, a reload keeps the player where they were, and the tab
 * says where they are.
 *
 * Only places that exist on their own get an address a reload can return to:
 * Today, Progress, every serve, one stored serve, the sample and a practice
 * session. A live report, the read in progress, the glance and an error hold a
 * clip that is gone after a reload, so they get an address that says what they
 * are and opens Today when loaded fresh.
 *
 * DOM-free and pure, so `routes.test.ts` walks it in Node.
 */

/** Just enough of a screen to name its address; `App.tsx`'s `View` fits it. */
export type RoutedView =
  | { kind: 'home' }
  | { kind: 'analyzing' }
  | { kind: 'report' }
  | { kind: 'glance' }
  | { kind: 'saved'; session: { id: string }; example?: boolean }
  | { kind: 'error' }
  | { kind: 'progress'; serves?: boolean }
  | { kind: 'session'; session: { id: string } }
  | { kind: 'page'; page: InfoPageId }

/**
 * The pages a visitor reads rather than uses (N6.3): how accurate the app is,
 * what it does with their data, the terms, and whose work is in it. Each has
 * an address of its own, so a link from anywhere opens it.
 */
export const INFO_PAGES = ['pricing', 'accuracy', 'privacy', 'terms', 'credits'] as const
export type InfoPageId = (typeof INFO_PAGES)[number]

export const INFO_TITLES: Record<InfoPageId, string> = {
  pricing: 'Plans',
  accuracy: 'How sure I am',
  privacy: 'Privacy',
  terms: 'Terms',
  credits: 'Credits',
}

/** What an address asks for when the page is loaded at it. */
export type Route =
  | { kind: 'home' }
  | { kind: 'progress' }
  | { kind: 'serves' }
  | { kind: 'serve'; id: string }
  | { kind: 'sample' }
  | { kind: 'practice'; id: string }
  | { kind: 'page'; page: InfoPageId }

/** The base the app is served under, always ending in a slash. */
function slash(base: string): string {
  return base.endsWith('/') ? base : `${base}/`
}

/** The address of a screen, under `base` (Vite's `BASE_URL`). */
export function pathFor(view: RoutedView, base = '/'): string {
  const b = slash(base)
  switch (view.kind) {
    case 'home':
      return b
    case 'progress':
      return `${b}${view.serves ? 'serves' : 'progress'}`
    case 'saved':
      return view.example ? `${b}sample` : `${b}serve/${encodeURIComponent(view.session.id)}`
    case 'session':
      return `${b}practice/${encodeURIComponent(view.session.id)}`
    case 'report':
      return `${b}report`
    case 'analyzing':
      return `${b}reading`
    case 'glance':
      return `${b}glance`
    case 'error':
      return `${b}problem`
    case 'page':
      return `${b}${view.page}`
  }
}

/** The tab's title for a screen. */
export function titleFor(view: RoutedView): string {
  const name: Record<RoutedView['kind'], string> = {
    home: 'Today',
    progress: 'Progress',
    saved: 'Your serve',
    session: 'Practice session',
    report: 'Your serve',
    analyzing: 'Reading your serve',
    glance: 'Your serve',
    error: 'Something stopped the read',
    page: 'Serve Coach',
  }
  let label = name[view.kind]
  if (view.kind === 'progress' && view.serves) label = 'Every serve'
  if (view.kind === 'saved' && view.example) label = 'Sample report'
  if (view.kind === 'page') label = INFO_TITLES[view.page]
  return `${label} | Serve Coach`
}

/**
 * The screen an address asks for. Anything it does not know, including an
 * address under a different base, is Today: a stale link should land somewhere
 * useful, never on a blank page.
 */
export function parsePath(pathname: string, base = '/'): Route {
  const b = slash(base)
  if (!pathname.startsWith(b)) return { kind: 'home' }
  const parts = pathname
    .slice(b.length)
    .split('/')
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p)
      } catch {
        return p
      }
    })
  const [head, id, ...rest] = parts
  if (rest.length) return { kind: 'home' }
  if (head === 'progress' && !id) return { kind: 'progress' }
  if (head === 'serves' && !id) return { kind: 'serves' }
  if (head === 'sample' && !id) return { kind: 'sample' }
  if (head === 'serve' && id) return { kind: 'serve', id }
  if (head === 'practice' && id) return { kind: 'practice', id }
  if (!id && (INFO_PAGES as readonly string[]).includes(head)) return { kind: 'page', page: head as InfoPageId }
  // Back from paying, or Plus brought to another device: the plans say where it stands (N6.5).
  if (head === 'plus' && !id) return { kind: 'page', page: 'pricing' }
  return { kind: 'home' }
}
