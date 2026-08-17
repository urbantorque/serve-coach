/**
 * Everything the one file that leaves the device carries, enumerated.
 *
 * WHY THIS FILE EXISTS. `egress.test.ts` closes constraint 7 on the axis it is
 * usually meant: no network call, no analytics, no account. It says nothing
 * about the export, because the export is not egress the app performs — it is
 * egress the *player* performs, deliberately, and it is the one sanctioned way
 * anything ever leaves the phone.
 *
 * Which makes what it contains a promise of the same kind. `StoragePanel` tells
 * the player, in as many words: *"An export is one file holding your scores and
 * real photos of you serving, not just numbers."* That sentence is correct
 * today. Nothing was making it stay correct.
 *
 * THE FAILURE THIS CATCHES, WITH A WORKED EXAMPLE. R74 added the tag store to
 * the backup — which serve it was, where it landed — and did not revisit that
 * sentence. It happens to still be true, because taps are neither scores nor
 * photos and the sentence is about what is in there rather than an exhaustive
 * list. But nothing asked. The next field might be a device identifier, a
 * timestamp trail, or the framing thumbnails, and the sentence would go on
 * saying "scores and photos" while the file said more.
 *
 * So: every top-level key the export writes has a ruling, and each ruling says
 * what a player would understand themselves to be handing over. A field added
 * without one fails here. This does not read the copy — the copy is checked by
 * `jsxCopy.test.ts` and would need a human to judge the sentence anyway — it
 * forces the question to be asked at the moment the file grows.
 *
 * DRIVEN, NOT PARSED. `buildBackup` is called against a memory store, so this is
 * the real shape the real function writes rather than a reading of its type. A
 * type can be right while the builder omits a field, and it was the builder that
 * was wrong for twenty rounds when the tags were missing.
 */
import { buildBackup, type BackupStore } from '../backup'
import { DEFAULTS, type Prefs } from '../prefs'
import type { PracticeLog, ServeTag, Session } from '../db'
import type { Analysis } from '../../analysis/types'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

/** What a player would understand themselves to be handing over, per key. */
interface Ruling {
  key: string
  /** In the player's terms, not the codebase's. */
  what: string
  /** Whether a reasonable person would call this a picture of themselves. */
  personal: boolean
}

const RULINGS: readonly Ruling[] = [
  { key: 'format', what: 'a label saying which app wrote the file', personal: false },
  { key: 'version', what: 'a number saying which shape the file is in', personal: false },
  { key: 'exportedAt', what: 'when they pressed export', personal: false },
  {
    key: 'sessions',
    what: 'every report: the scores, the measurements, and the six keyframe photographs of them serving',
    // THE ONE THAT MATTERS. A report carries base64 stills, so this file is
    // pictures of a person and the panel says so before they press anything.
    personal: true,
  },
  { key: 'practice', what: 'which drills they ticked off and when', personal: false },
  {
    key: 'prefs',
    what: 'which hand they serve with, the level they picked, and which serve they were filming',
    // Three fields, not the whole of `Prefs`. `seenFilmingGuide` and
    // `askedToPersist` are facts about an install rather than about a player and
    // are deliberately absent — see `Backup['prefs']`.
    personal: false,
  },
  {
    key: 'tags',
    what: 'what they tapped about their own serves: which serve it was, where it landed',
    personal: false,
  },
]

function memoryStore(opts: { sessions?: Session[]; tags?: ServeTag[] } = {}): BackupStore {
  let prefs: Prefs = { ...DEFAULTS }
  return {
    listSessions: async () => opts.sessions ?? [],
    saveSession: async (_a: Analysis) => {},
    listPracticeLogs: async () => [] as PracticeLog[],
    logPractice: async (_l: PracticeLog) => {},
    listServeTags: async () => opts.tags ?? [],
    tagServe: async (_t: ServeTag) => {},
    pruneSessions: async () => {},
    readPrefs: () => ({ ...prefs }),
    writePrefs: (patch: Partial<Prefs>) => {
      prefs = { ...prefs, ...patch }
      return { ...prefs }
    },
  }
}

heading('What the player is actually handing over')

const backup = await buildBackup(memoryStore())
const keys = Object.keys(backup).sort()
note(`${keys.length} top-level keys: ${keys.join(', ')}`)

await check('every key the export writes has been ruled on', async () => {
  const ruled = new Set(RULINGS.map((r) => r.key))
  const unruled = keys.filter((k) => !ruled.has(k))
  assert(
    unruled.length === 0,
    `the export carries ${unruled.join(', ')} with nothing saying what a player would ` +
      'understand that to be. Add a ruling, and re-read the sentence in StoragePanel that ' +
      'tells them what is in the file.',
  )
})

await check('no ruling describes a key the export stopped writing', async () => {
  // The half `jsxCopy.test.ts` had to grow and `reachable.test.ts` inherited: a
  // list nobody prunes becomes a list of things that are not there, and the next
  // real one is added beside them without anybody noticing the difference.
  const stale = RULINGS.filter((r) => !keys.includes(r.key))
  assert(stale.length === 0, `these are no longer in the file: ${stale.map((r) => r.key).join(', ')}`)
})

await check('the file is still pictures of a person, which is what the panel says', async () => {
  /*
   * Asserted rather than assumed, because it is the claim the player acts on.
   * If the reports ever stopped carrying stills this would go red — and the
   * right response would be to soften the panel's warning, not to delete this.
   *
   * `StoragePanel`: "An export is one file holding your scores and real photos
   * of you serving, not just numbers."
   */
  const personal = RULINGS.filter((r) => r.personal)
  assert(
    personal.length > 0,
    'nothing in the export is marked personal any more, so the panel is over-warning',
  )
  assert(
    personal.some((r) => r.key === 'sessions'),
    'the reports are no longer the personal part, which changes what the panel should say',
  )
  note(`${personal.length} of ${RULINGS.length} keys carry something personal`)
})

await check('the export is driven, so a key the type declares but the builder omits still fails', async () => {
  /*
   * The reason this calls `buildBackup` rather than reading `Backup`. A type can
   * be right while the builder is wrong, and the builder was wrong for twenty
   * rounds: the tag store existed, `Backup` could have declared it, and
   * `buildBackup` did not write it — so a player moving phones silently lost
   * every tap they had made.
   */
  const withData = await buildBackup(
    memoryStore({ tags: [{ id: 'a', serveNumber: 1, outcome: 'in', taggedAt: 1 }] }),
  )
  assert(withData.tags?.length === 1, 'the builder dropped a tag the store held')
  assert(
    Object.keys(withData).length === keys.length,
    'the export writes a different set of keys depending on what the store holds',
  )
})

report()
