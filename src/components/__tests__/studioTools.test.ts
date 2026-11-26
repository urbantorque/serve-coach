/**
 * The laptop studio's tools say what they do (E5.3).
 *
 * The studio is the reason to open a laptop: a clip, frame keys, lines and
 * angles drawn on the picture, a still or a clip saved. Its tools were named
 * "Line", "Angle", "Body lines": a name, not what the tool does. Each now
 * carries a title saying what it does, and the zoom its key; the player says
 * its keys out loud and as \`aria-keyshortcuts\`, and takes focus so every one
 * of them works without a mouse. Read off the source, because the studio only
 * renders with a clip and a laptop's width, which a test has neither of.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { assert, check, heading, note, report } from '../../lib/analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e: string) => string }
const src = fs.readFileSync('src/components/PosePlayer.tsx', 'utf8')

heading('The studio’s tools say what they do (E5.3)')

check('every studio tool button carries a title saying what it does', () => {
  // Whole buttons: an opening tag holds arrow functions, so its first ">" is not its end.
  const buttons = [...src.matchAll(/<button\b[\s\S]*?<\/button>/g)].map((m) => m[0]).filter((b) => b.includes('watch-lines'))
  note(`${buttons.length} studio tool buttons`)
  assert(buttons.length >= 7, `only ${buttons.length} tool buttons found: the scan has stopped seeing them`)
  const bare = buttons.filter((b) => !/\btitle=/.test(b))
  assert(bare.length === 0, `tools with no title: ${bare.map((b) => b.replace(/\s+/g, ' ').slice(0, 80)).join('; ')}`)
})

check('the player takes focus and says its keys', () => {
  assert(/className="player"\s+tabIndex=\{0\}/.test(src), 'the player can’t take focus')
  assert(/aria-keyshortcuts="[^"]*ArrowLeft[^"]*"/.test(src), 'the player’s keys aren’t given as shortcuts')
  assert(/aria-label="Serve video\. [^"]*arrows[^"]*"/.test(src), 'the player doesn’t say its keys')
})

report()
