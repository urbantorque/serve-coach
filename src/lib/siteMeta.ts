/**
 * What a search engine and a shared link read (N6.6): the canonical address,
 * the preview picture, the sitemap and robots.txt.
 *
 * Every absolute address here is the site's own, from `VITE_SITE_URL`, which
 * only the owner can set once there is a domain (`OWNER-STEPS.md`). Unset,
 * the build adds no address at all, so `index.html` never names a host, and
 * robots.txt still says the site may be read.
 *
 * Pure, so the Vite config and `siteMeta.test.ts` share it.
 */
import { INFO_PAGES } from './routes'

/** The addresses that stand alone and are worth a search engine's time. */
export const PUBLIC_PATHS: string[] = ['/', '/sample', ...INFO_PAGES.map((p) => `/${p}`)]

export interface HeadTag {
  tag: 'link' | 'meta'
  attrs: Record<string, string>
}

const clean = (site: string) => site.replace(/\/+$/, '')

/** The tags that need the site's own address. None without one. */
export function headTags(site: string | undefined): HeadTag[] {
  if (!site) return []
  const s = clean(site)
  return [
    { tag: 'link', attrs: { rel: 'canonical', href: `${s}/` } },
    { tag: 'meta', attrs: { property: 'og:url', content: `${s}/` } },
    { tag: 'meta', attrs: { property: 'og:image', content: `${s}/og.jpg` } },
    { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
    { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
    { tag: 'meta', attrs: { property: 'og:image:alt', content: 'A real serve drawn as one picture, beside the words: film one serve, see the one thing to fix.' } },
    { tag: 'meta', attrs: { name: 'twitter:image', content: `${s}/og.jpg` } },
  ]
}

export function sitemapXml(site: string, paths: readonly string[] = PUBLIC_PATHS): string {
  const s = clean(site)
  const urls = paths.map((p) => `  <url><loc>${s}${p === '/' ? '/' : p}</loc></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

/** Read everything but the payment functions; the sitemap, where there is a site. */
export function robotsTxt(site: string | undefined): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n${site ? `Sitemap: ${clean(site)}/sitemap.xml\n` : ''}`
}
