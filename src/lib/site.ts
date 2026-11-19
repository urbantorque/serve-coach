/**
 * Who runs the site and where it lives (N6.3). Set by the owner at build time,
 * in `.env.production` or the host's settings, and listed in
 * `docs/next/OWNER-STEPS.md`; nothing here is guessed. Unset, a page leaves the
 * line out rather than print a placeholder. Read the way `poseEngine.ts` reads
 * the base, so the Node tests, where `import.meta.env` does not exist, see none.
 */
const url = (import.meta.env?.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, '')

export const SITE = {
  /** The site's own address, for canonical links and the sitemap: `https://…`, no trailing slash. */
  url: url || undefined,
  /** The person or company that runs it, as the terms name them. */
  operator: (import.meta.env?.VITE_SITE_OPERATOR as string | undefined) || undefined,
  /** Where a visitor writes about privacy or the terms. */
  contact: (import.meta.env?.VITE_SITE_CONTACT as string | undefined) || undefined,
}

/** When the privacy page and the terms last changed in substance. */
export const POLICY_DATE = '19 November 2026'
