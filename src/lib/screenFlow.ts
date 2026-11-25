/**
 * Every legal move between the app's screens, as data rather than as a comment.
 *
 * `App.tsx` has carried this table in prose since R7, which looked at the
 * implicit state machine in that file and decided — correctly, and this does not
 * reopen it — that a reducer would be worse: the four satellite pieces of state
 * are each scoped to exactly the screens that read them, so a single combined
 * state would carry fields most screens never touch rather than removing
 * anything. What R7 wrote instead was "every transition below was walked by
 * hand for a screen it could strand and none was found", followed by the table.
 *
 * That is a load-bearing claim about twenty-one `setView` call sites, and
 * nothing executed it. This codebase's most repeated finding across three
 * phases is that hand-walked claims turn out wrong, and this one was, in two
 * directions at once — see `MOVES` for both.
 *
 * THIS IS NOT A REDUCER AND MUST NOT BECOME ONE. Nothing here runs at runtime;
 * `App.tsx` does not import it and no `setView` is routed through it. It is the
 * table, in a form a test can walk. If it ever starts deciding transitions
 * rather than describing them, R7's argument has been quietly reversed.
 */

/**
 * The screens, in the order `View` declares them.
 *
 * `App.tsx`'s `View` union carries a payload per screen — an analysis, a
 * session, an error's hints — and that is why the union lives there and this
 * does not simply derive from it. What is checked instead is narrower and
 * harder to get wrong: the test scans `App.tsx` for every `kind:` it names and
 * fails if one is missing here, so a new screen cannot be added without
 * arriving in this table.
 */
export const SCREENS = ['home', 'analyzing', 'report', 'glance', 'saved', 'error', 'progress', 'session', 'page'] as const

export type Screen = (typeof SCREENS)[number]

/** One legal move, and the thing in `App.tsx` that makes it. */
export interface Move {
  to: Screen
  /** The function or handler that performs it, by name. */
  via: string
}

/**
 * The graph, transcribed from the code rather than from R7's prose.
 *
 * TWO PLACES THE PROSE WAS WRONG, both found by transcribing rather than
 * copying, and both the same shape: a table written from what the author
 * intended the flow to be rather than from what the calls do.
 *
 *   · IT CLAIMED `analyzing` → `saved`. Nothing does that. `saved` is set in
 *     exactly three places — `showExample`, `openSaved` and the dev `?demo`
 *     branch — and every one of them is reachable only from `home`, because the
 *     history sheet's opener is a prop only `Home` is given. A screen listed as
 *     an exit from `analyzing` that no code can take is the more dangerous of
 *     the two errors: it is the kind of entry a later reader trusts when
 *     deciding whether some new state needs clearing on the way through.
 *
 *   · IT OMITTED `home` → `error` AND `report` → `error`. `run` refuses two
 *     things before it ever sets `analyzing` — a file over `MAX_BYTES`, and one
 *     whose declared type is not a video — and both `return` straight after
 *     setting `error`. So the error screen is reachable without passing through
 *     `analyzing` at all, from either caller. The prose said "`analyzing`'s
 *     `error` landing is always reached by way of one of those two", which is
 *     true of the *caller* and reads as a claim about the *route*.
 *
 * Neither was a bug in the app. Both were a map that disagreed with the ground.
 */
export const MOVES: Record<Screen, Move[]> = {
  home: [
    { to: 'analyzing', via: 'openClip → run' },
    // Before `analyzing`, not after it: `run` refuses an oversized file and a
    // non-video by their declared type and returns immediately.
    { to: 'error', via: 'run (too large, or not a video)' },
    { to: 'saved', via: 'openSaved' },
    { to: 'saved', via: 'showExample' },
    { to: 'progress', via: 'onShowProgress' },
    // A clip past `SESSION_SECONDS`, routed by its length before `run` is
    // reached, and a stored session reopened from its row (L2.4).
    { to: 'session', via: 'openClip → openSessionClip' },
    { to: 'session', via: 'onOpenPracticeSession' },
    // How sure I am, privacy, terms and credits (N6.3), from the first run's
    // foot and from Settings.
    { to: 'page', via: 'showPage' },
  ],
  analyzing: [
    { to: 'report', via: 'run (success)' },
    { to: 'glance', via: 'openClip (recorded in the app)' },
    { to: 'report', via: 'compareServes (measured, or stopped with nothing yet)' },
    { to: 'error', via: 'run (decode failure, not a serve)' },
    { to: 'error', via: 'compareServes (fewer than two readable serves)' },
    { to: 'home', via: 'cancel' },
  ],
  report: [
    // Same-kind moves. Re-scoring, re-diagnosing, switching serves and a cache
    // hit all swap the analysis without leaving the screen — which is why
    // `Report` is keyed on `analysis.id`, so its own state cannot outlive the
    // report it belongs to.
    { to: 'report', via: 'onPickServeType / onPickTier / cache hit' },
    // The glance for any clip, not only one recorded in the app (D6.1).
    { to: 'glance', via: 'onGlance' },
    { to: 'analyzing', via: 'onFlipHandedness / onPickServe → run' },
    { to: 'analyzing', via: 'onCheckConsistency → compareServes' },
    { to: 'error', via: 'run (too large, or not a video)' },
    // "Go again" lands on home with the picker or the viewfinder already
    // open over it (N0.4), so the move is still to home.
    { to: 'home', via: 'goHome / onAnalyzeAnother / onFilmAgain (captureAgain)' },
  ],
  glance: [
    { to: 'report', via: 'onOpenReport' },
    // Back to the reopened report it came from (N1.8).
    { to: 'saved', via: 'onOpenReport (no clip)' },
    { to: 'home', via: 'onBack / onRecordAnother' },
  ],
  saved: [
    { to: 'home', via: 'goHome / onAnalyzeAnother (captureAgain)' },
    // The glance from a reopened report too (N1.8).
    { to: 'glance', via: 'onGlance' },
  ],
  error: [{ to: 'home', via: 'captureAgain (pick, or the framing check)' }],
  // Was a sheet over home until it outgrew one; see `screens/Progress.tsx`.
  progress: [{ to: 'home', via: 'goHome' }],
  // One page links to the others, and every page goes home.
  page: [
    { to: 'page', via: 'showPage' },
    { to: 'home', via: 'goHome' },
  ],
  session: [
    // Planning, reading, paused and done are one screen's stages, not screens.
    { to: 'session', via: 'startSession / stopSession' },
    { to: 'error', via: 'sessionFailed (the video couldn’t be read or scanned)' },
    { to: 'home', via: 'leaveSession' },
  ],
}

/** Every screen reachable from `start`, including `start` itself. */
export function reachableFrom(start: Screen): Set<Screen> {
  const seen = new Set<Screen>([start])
  const queue: Screen[] = [start]
  while (queue.length) {
    for (const move of MOVES[queue.pop()!]) {
      if (seen.has(move.to)) continue
      seen.add(move.to)
      queue.push(move.to)
    }
  }
  return seen
}

/**
 * Screens with no route back to `home`.
 *
 * The question R7's walk was actually asking. A screen the player can enter and
 * not leave is the one failure this table exists to rule out, and on a phone it
 * is worse than it sounds: there is no address bar to retreat to.
 */
export function stranded(): Screen[] {
  return SCREENS.filter((screen) => !reachableFrom(screen).has('home'))
}
