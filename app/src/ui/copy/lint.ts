import { NEVER_SAY } from './strings.ts'

/**
 * Copy lint (DESIGN §11 rules 6 and 12, §13.7 item 4): returns the problems in a piece of
 * player-facing text. Used by tests over strings.ts and over rendered screens.
 */
export function lintCopy(text: string): string[] {
  const problems: string[] = []
  if (/[–—]/.test(text)) problems.push('en or em dash')
  if (text.includes('!')) problems.push('exclamation mark')
  if (/\p{Extended_Pictographic}/u.test(text)) problems.push('emoji')
  if (/\bAI\b/.test(text)) problems.push('"AI"')
  const lower = text.toLowerCase()
  for (const phrase of NEVER_SAY) {
    if (new RegExp(`\\b${phrase}\\b`).test(lower)) problems.push(`never-say "${phrase}"`)
  }
  return problems
}
