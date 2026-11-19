/**
 * What search engines and shared links read (N6.6). Every address is the
 * site's own and only the owner can set it, so these hold both halves: with
 * no site, the page names no host; with one, every address is under it and
 * every page worth finding is in the sitemap.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { PUBLIC_PATHS, headTags, robotsTxt, sitemapXml } from '../siteMeta'
import { parsePath } from '../routes'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e: string) => string; existsSync: (p: string) => boolean }
const SITE = 'https://example.test'

heading('What a search engine and a shared link read')

check('with no site set, nothing names a host, and robots.txt still lets the site be read', () => {
  assert(headTags(undefined).length === 0, 'tags were written with no site')
  const robots = robotsTxt(undefined)
  assert(/Allow: \/\n/.test(robots) && !/Sitemap/.test(robots) && !/https?:/.test(robots), robots)
})

check('with a site, every address is under it, and the picture and canonical are absolute', () => {
  const tags = headTags(`${SITE}/`)
  const urls = tags.flatMap((t) => Object.values(t.attrs)).filter((v) => /^https?:/.test(v))
  note(urls.join(' '))
  assert(urls.length >= 3 && urls.every((u) => u.startsWith(`${SITE}/`) && !u.includes('//og') && !u.startsWith(`${SITE}//`)), urls.join(' '))
  assert(tags.some((t) => t.attrs.rel === 'canonical' && t.attrs.href === `${SITE}/`), 'no canonical')
  assert(tags.some((t) => t.attrs.property === 'og:image' && t.attrs.content === `${SITE}/og.jpg`), 'no preview picture')
})

check('the sitemap lists every page that stands alone, and every one opens that page', () => {
  const xml = sitemapXml(SITE)
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  assert(locs.length === PUBLIC_PATHS.length && locs.every((l) => l.startsWith(`${SITE}/`)), locs.join(' '))
  for (const p of PUBLIC_PATHS.filter((x) => x !== '/')) assert(parsePath(p).kind !== 'home', `${p} is in the sitemap and opens Today`)
  assert(PUBLIC_PATHS.includes('/accuracy') && PUBLIC_PATHS.includes('/pricing') && PUBLIC_PATHS.includes('/privacy'), PUBLIC_PATHS.join(' '))
  assert(/Disallow: \/api\//.test(robotsTxt(SITE)) && robotsTxt(SITE).includes(`Sitemap: ${SITE}/sitemap.xml`), robotsTxt(SITE))
})

check('the page says what the app is to a laptop as well as a phone, and has its preview picture', () => {
  const html = fs.readFileSync('index.html', 'utf8')
  const description = /name="description"\s+content="([^"]+)"/.exec(html)?.[1] ?? ''
  assert(description.length > 60 && description.length <= 160 && !/phone/i.test(description), `description: "${description}"`)
  assert(/property="og:title"/.test(html) && /name="twitter:card" content="summary_large_image"/.test(html), 'share tags missing')
  assert(fs.existsSync('public/og.jpg'), 'no preview picture in public/')
})

report()
