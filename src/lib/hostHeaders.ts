/**
 * The static host's response headers, read from `public/_headers` (N6.2).
 *
 * The file is in the format Cloudflare Pages and Netlify both read: a path
 * pattern on its own line, its headers indented under it, `#` for a comment.
 * `vite preview` applies it through this parser, so a local preview of a build
 * answers with what the host will, content security policy included, and
 * `hostHeaders.test.ts` holds the rules themselves.
 *
 * DOM-free and pure, so it runs in Node and in the Vite config alike.
 */

export interface HeaderRule {
  pattern: string
  headers: [string, string][]
}

/** Every rule in the file, in order. Comments and blank lines are dropped. */
export function parseHeaders(text: string): HeaderRule[] {
  const rules: HeaderRule[] = []
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    if (!/^\s/.test(raw)) {
      rules.push({ pattern: raw.trim(), headers: [] })
      continue
    }
    const at = raw.indexOf(':')
    const rule = rules[rules.length - 1]
    if (!rule || at < 0) continue
    rule.headers.push([raw.slice(0, at).trim(), raw.slice(at + 1).trim()])
  }
  return rules
}

/** Whether a pattern covers a path: `*` stands for anything, `/` included. */
export function patternMatches(pattern: string, pathname: string): boolean {
  const re = new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
  return re.test(pathname)
}

/** The headers a path is answered with: every matching rule, a later one winning a name. */
export function headersFor(rules: readonly HeaderRule[], pathname: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rule of rules) {
    if (!patternMatches(rule.pattern, pathname)) continue
    for (const [k, v] of rule.headers) out[k] = v
  }
  return out
}

/** One directive's sources from a content security policy, or undefined where it has none. */
export function cspSources(policy: string, directive: string): string[] | undefined {
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name === directive) return sources
  }
  return undefined
}
