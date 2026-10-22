import { readoutOf } from '../analysis/anatomy'
import { SERVE_TYPES, isMeasured } from '../analysis/coaching'
import { consistencyHeadline, type Consistency } from '../analysis/consistency'
import type { Analysis } from '../analysis/types'
import { plain } from '../analysis/voice'
import { SOFT_READ, readQuality } from '../../components/statusLabels'
import type { Session } from '../storage/db'
import type { TripSummary } from '../progress'
import { drawSkeleton, type DrawRect } from '../pose/skeleton'
import type { CardPose, GraduationCard } from '../graduationCard'

type Report = Analysis | Session

const INK = '#0a0c10'
const INK_2 = '#141822'
const FG = '#eef2f6'
const MUTED = '#98a2b3'
const FAINT = '#616b7d'
const LIME = '#cdf94a'

const STATUS_COLOR: Record<string, string> = {
  great: '#5fe3a1',
  good: '#cdf94a',
  fair: '#ffb648',
  work: '#ff7a6b',
}

const font = (weight: number, size: number) =>
  `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Break text into lines that fit, without drawing any of them.
 *
 * Separate from the drawing so the card's layout can be computed before the
 * canvas is sized. The coaching copy is written for a person rather than for a
 * fixed box — the longest `fix` string runs to four lines where most run to two —
 * so anything positioned below it has to be placed from its measured height. The
 * alternative is a card that looks right for most faults and overlaps for one.
 *
 * Depends on the current `ctx.font`, so set it before calling.
 */
function layoutLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Draw pre-measured lines, returning the y position after the last one. */
function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
): number {
  let cursor = y
  for (const line of lines) {
    ctx.fillText(line, x, cursor)
    cursor += lineHeight
  }
  return cursor
}

/** Measure and draw in one go, for text nothing is positioned beneath. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  return drawLines(ctx, layoutLines(ctx, text, maxWidth), x, y, lineHeight)
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | undefined>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(undefined)
    img.src = src
  })

/**
 * Draw the report as a single shareable image.
 *
 * Everything a coach needs to react to without the app: the score, the one
 * thing to work on, the five areas, and the keyframes with the tracking drawn
 * on. The video itself is never stored and never leaves the device, so these
 * stills are what there is to show — which is also why they carry the skeleton.
 *
 * WHAT IS AND IS NOT HERE, of the two pictures added since:
 *
 * The target dial arrives for free and deliberately. It is drawn into the still
 * at capture time rather than composed on screen, so the shared image carries
 * the same evidence the report does — a card that showed a bare arc where the
 * report shows an arc, a band and a reading would be a quieter claim about the
 * same serve, and the honest half is the one that would have been dropped.
 *
 * The paired comparisons — best serve against worst, and then against now — are
 * deliberately absent. This card is one serve: its score, its fault, its six
 * moments. Both pairs are statements about a *set* of serves, one of them about
 * a basket and one about two months, and neither can be read without the dates
 * or serve numbers that give it meaning. Half of a comparison, shared without
 * them, is a picture of two serves with nothing saying which is which. The
 * report holds both, and the report is where they mean something.
 */
export async function renderReportCard(
  report: Report,
  /**
   * The trip streak line, already worded by `streakLine` — a plain sentence,
   * not a badge asset. Absent below two trips, the same restraint the home
   * card holds; this card just carries the same sentence rather than
   * inventing a shorter one for the smaller canvas.
   */
  streak?: string,
  /**
   * The best-score record line, already worded by `bestTripLine` —
   * see the progress sheet's own `sheetBestScore`. Grouped with `streak`
   * above rather than beside the score ring, the same "whole journey, not
   * this one serve" reasoning that groups the two on the progress sheet.
   */
  bestScore?: string,
): Promise<Blob | undefined> {
  const W = 1080
  const PAD = 64
  const stills = report.phases.filter((p) => p.thumbnail)

  // Lay the keyframes out three across; height follows from what is available.
  const cols = 3
  const rows = stills.length ? Math.ceil(stills.length / cols) : 0
  const cellW = (W - PAD * 2 - 16 * (cols - 1)) / cols
  const cellH = cellW * 1.25
  const stripH = rows ? rows * (cellH + 44) + 30 : 0

  const canvas = document.createElement('canvas')
  canvas.width = W
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined

  /* --- layout ----------------------------------------------------------- */
  // Everything below the focus paragraph is placed from its measured height, so
  // a long coaching line pushes the card taller instead of running into what
  // comes next. Measured before the canvas is sized because the card's height is
  // one of the things it decides.
  const cy = 250
  const ringR = 78
  const textX = PAD + 210
  const textW = W - textX - PAD

  ctx.font = font(400, 20)
  // Flattened: the report marks its key words for the screen, and a canvas has
  // no idea what an asterisk means. A card shared to a coach must not arrive
  // with the markup showing.
  const focusWhy = plain(report.focus.why)
  const focusLines = layoutLines(ctx, focusWhy, textW)
  const focusEnd = cy + 20 + focusLines.length * 30

  // Clear both the paragraph and the bottom of the score ring: on a short fault
  // the ring is the taller of the two.
  const chipY = Math.max(focusEnd + 22, cy + ringR + 40)
  const barY = chipY + 48
  const HEADER = barY + 74 + 36

  // A fixed strip above the drill box for each of the two optional records —
  // absent, either must not leave a blank gap on the card.
  const STREAK_H = streak ? 34 : 0
  const BEST_SCORE_H = bestScore ? 34 : 0
  const H = HEADER + stripH + 260 + STREAK_H + BEST_SCORE_H
  canvas.height = H

  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)

  const glow = ctx.createRadialGradient(W / 2, -140, 40, W / 2, -140, 760)
  glow.addColorStop(0, 'rgba(205,249,74,0.16)')
  glow.addColorStop(1, 'rgba(205,249,74,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, HEADER)

  /* --- header ---------------------------------------------------------- */
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = LIME
  ctx.beginPath()
  ctx.arc(PAD + 9, PAD + 14, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = font(640, 24)
  ctx.fillStyle = FG
  ctx.fillText('Serve Coach', PAD + 30, PAD + 22)

  ctx.font = font(500, 20)
  ctx.fillStyle = FAINT
  ctx.textAlign = 'right'
  ctx.fillText(
    new Date(report.createdAt).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    W - PAD,
    PAD + 22,
  )
  ctx.textAlign = 'left'

  /* --- score ring ------------------------------------------------------- */
  const cx = PAD + 92
  const r = ringR
  const status = STATUS_COLOR[report.overallStatus] ?? LIME

  ctx.lineWidth = 14
  ctx.strokeStyle = '#1b2130'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = status
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (report.overall / 100) * Math.PI * 2)
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.font = font(680, 54)
  ctx.fillStyle = FG
  ctx.fillText(String(report.overall), cx, cy + 12)
  ctx.font = font(600, 14)
  ctx.fillStyle = FAINT
  ctx.fillText('OVERALL', cx, cy + 38)
  ctx.textAlign = 'left'

  /* --- what this score is a score of ------------------------------------ */
  /*
   * A shared card is read without the app around it, often by a coach who was
   * not there when it was filmed. "65 out of 100" means nothing on its own: the
   * target bands differ by serve type, and how much the numbers can be trusted
   * depends on how the clip was shot. A kick serve judged against kick targets
   * and a flat serve judged against flat ones are not comparable scores, and
   * without saying which is which the card invites exactly that comparison.
   */
  /*
   * `soft` is carried on the chip rather than recovered from its words.
   *
   * This used to ask `label.endsWith('read')`, which worked only while the
   * confidence phrases happened to end in that word. Renaming them for
   * legibility silently switched the amber tint off — a caveat the card is
   * supposed to carry, lost with nothing failing. Prose is not an identifier.
   */
  const chips: { label: string; soft?: boolean }[] = [
    { label: SERVE_TYPES[report.serveType ?? 'flat']?.label ?? 'Flat / first serve' },
    { label: report.handedness === 'left' ? 'Left-handed' : 'Right-handed' },
    {
      label:
        report.quality.view === 'side'
          ? 'Side view'
          : report.quality.view === 'front-back'
            ? 'Front / back view'
            : 'Angled view',
    },
    {
      label: readQuality(report.quality.confidence),
      soft: report.quality.confidence < SOFT_READ,
    },
  ]

  let chipX = PAD
  ctx.font = font(560, 17)
  for (const { label, soft } of chips) {
    const w = ctx.measureText(label).width + 26
    // Wrap rather than run off the edge: translated or unusually long labels
    // would otherwise silently disappear past the right margin.
    if (chipX + w > W - PAD) break
    ctx.fillStyle = INK_2
    roundRect(ctx, chipX, chipY - 20, w, 34, 17)
    ctx.fill()
    // Low confidence is the one of these that changes how the card should be
    // read, so it is the one that gets colour.
    ctx.fillStyle = soft ? STATUS_COLOR.fair : MUTED
    ctx.fillText(label, chipX + 13, chipY + 3)
    chipX += w + 8
  }

  /* --- focus ------------------------------------------------------------ */
  ctx.font = font(700, 16)
  ctx.fillStyle = LIME
  ctx.fillText('WORK ON THIS NEXT', textX, cy - 58)
  ctx.font = font(640, 34)
  ctx.fillStyle = FG
  ctx.fillText(report.focus.title, textX, cy - 16)
  ctx.font = font(400, 20)
  ctx.fillStyle = MUTED
  // The same lines the layout above was measured from, so what is drawn and what
  // was reserved for it cannot disagree.
  drawLines(ctx, focusLines, textX, cy + 20, 30)

  /* --- the five areas --------------------------------------------------- */
  const barW = (W - PAD * 2 - 14 * (report.fundamentals.length - 1)) / report.fundamentals.length
  report.fundamentals.forEach((f, i) => {
    const x = PAD + i * (barW + 14)
    ctx.fillStyle = INK_2
    roundRect(ctx, x, barY, barW, 74, 14)
    ctx.fill()

    // A dash and no status colour for an area the clip could not grade
    // (L1.1): the image outlives the report, and a 0 on it is a verdict.
    const measured = isMeasured(f)
    ctx.fillStyle = measured ? (STATUS_COLOR[f.status] ?? LIME) : FAINT
    ctx.font = font(660, 30)
    ctx.textAlign = 'center'
    ctx.fillText(measured ? String(f.score) : '–', x + barW / 2, barY + 38)
    ctx.font = font(500, 15)
    ctx.fillStyle = FAINT
    ctx.fillText(f.label, x + barW / 2, barY + 60)
    ctx.textAlign = 'left'
  })

  /* --- keyframes -------------------------------------------------------- */
  if (rows) {
    const top = HEADER
    const images = await Promise.all(stills.map((p) => loadImage(p.thumbnail!)))
    stills.forEach((phase, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = PAD + col * (cellW + 16)
      const y = top + row * (cellH + 44)

      ctx.save()
      roundRect(ctx, x, y, cellW, cellH, 16)
      ctx.clip()
      ctx.fillStyle = INK_2
      ctx.fillRect(x, y, cellW, cellH)
      const img = images[i]
      if (img) {
        // cover, so the still fills the cell without distorting
        const s = Math.max(cellW / img.width, cellH / img.height)
        const dw = img.width * s
        const dh = img.height * s
        ctx.drawImage(img, x + (cellW - dw) / 2, y + (cellH - dh) / 2, dw, dh)
      }
      ctx.restore()

      ctx.font = font(620, 18)
      ctx.fillStyle = FG
      ctx.fillText(phase.label, x, y + cellH + 26)
    })
  }

  /* --- footer ----------------------------------------------------------- */
  const footY = H - 150

  // Above the drill box rather than beside the score, the same reasoning
  // `sixWeekMilestone`'s home-card placement uses: these are facts about
  // the whole journey, not about this one serve, so neither competes with
  // the ring for the card's one big number. `streak` keeps the exact slot
  // it always has, so a card with no `bestScore` draws pixel-identical to
  // before; `bestScore` stacks above it only when both are present.
  let recordY = footY - 14
  if (streak) {
    ctx.font = font(560, 16)
    ctx.fillStyle = LIME
    ctx.textAlign = 'center'
    ctx.fillText(streak, W / 2, recordY)
    ctx.textAlign = 'left'
    recordY -= 34
  }
  if (bestScore) {
    ctx.font = font(560, 16)
    ctx.fillStyle = LIME
    ctx.textAlign = 'center'
    ctx.fillText(bestScore, W / 2, recordY)
    ctx.textAlign = 'left'
  }

  ctx.fillStyle = INK_2
  roundRect(ctx, PAD, footY, W - PAD * 2, 100, 18)
  ctx.fill()

  ctx.font = font(620, 19)
  ctx.fillStyle = FG
  ctx.fillText(report.focus.drill.name, PAD + 26, footY + 36)
  ctx.font = font(400, 17)
  ctx.fillStyle = MUTED
  wrap(ctx, report.focus.drill.reps, PAD + 26, footY + 64, W - PAD * 2 - 52, 24)

  ctx.font = font(400, 15)
  ctx.fillStyle = FAINT
  ctx.textAlign = 'center'
  ctx.fillText('Measured on your phone · the video never left it', W / 2, H - 22)
  ctx.textAlign = 'left'

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/png'))
}

/** A local date stamp for a filename — `toISOString` is UTC, and an evening
 *  serve west of Greenwich would be named for tomorrow. */
const dateStamp = (createdAt: number) => {
  const d = new Date(createdAt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** What `navigator` looks like to the sharing decision below, and nothing more. */
export interface ShareNavigator {
  canShare?: (data: { files?: File[] }) => boolean
  share?: (data: { files?: File[]; title?: string }) => Promise<void>
}

/**
 * Whether this browser should be asked to share a file at all, and what
 * happened if it was.
 *
 * Injected rather than read off `navigator` directly, so the decision can be
 * tested here — no browser to actually hand a file to. The same shape of
 * problem `record.ts`'s `recordingType` already solved: `navigator.share`
 * existing is not the same question as whether it will take *this* file, the
 * same gap between "the API exists" and "the API will do the thing" that
 * container support is.
 *
 * `canShare` gets asked first where a browser has it, because `share()`
 * itself throwing is a worse way to find out a file was never shareable.
 * Where a browser has `share` but not `canShare` — an older or partial
 * implementation — this tries anyway rather than refusing: the same
 * "absence of evidence must not remove a working control" rule
 * `recordingType` applies to a missing `canPlayType`. A `canShare` that
 * itself throws is read the same way, not as a hard no — a capability check
 * throwing is a browser being asked something it does not understand, not
 * proof of the thing it was asked about.
 *
 * `'not-attempted'` and `'failed'` are kept apart from the caller's point of
 * view — both fall through to a download — but stay distinguishable here in
 * case a future caller wants to know whether the browser was ever asked.
 */
export async function attemptShare(
  nav: ShareNavigator | undefined,
  file: File,
  title: string,
): Promise<'shared' | 'cancelled' | 'not-attempted' | 'failed'> {
  if (typeof nav?.share !== 'function') return 'not-attempted'

  if (typeof nav.canShare === 'function') {
    let canShareFiles: boolean
    try {
      canShareFiles = nav.canShare({ files: [file] })
    } catch {
      canShareFiles = true
    }
    if (!canShareFiles) return 'not-attempted'
  }

  try {
    await nav.share({ files: [file], title })
    return 'shared'
  } catch (err) {
    // Backing out of the share sheet is a decision, not a failure, and the
    // browser says which it was: a dismissal rejects with `AbortError`. This
    // used to fall through to the download either way, so a player who opened
    // the sheet and thought better of it got the file written to their phone
    // anyway — the one outcome they had just declined. Anything else really is
    // the share machinery failing, and the download is the right answer to it.
    return (err as Error)?.name === 'AbortError' ? 'cancelled' : 'failed'
  }
}

/**
 * Hand a rendered card to the OS share sheet where there is one, otherwise
 * download it. Both paths are local; nothing is sent anywhere by the app
 * itself. Shared by both card kinds, so a basket card and a single-serve one
 * cannot drift apart on how the same three outcomes are decided.
 */
export async function shareBlob(
  blob: Blob,
  name: string,
  title: string,
  /** The calendar file (M3.1) and the coach's report (M3.2) are not pictures. */
  type = 'image/png',
): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
  const file = new File([blob], name, { type })
  const outcome = await attemptShare(navigator as ShareNavigator, file, title)
  if (outcome === 'shared' || outcome === 'cancelled') return outcome

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

export async function shareReportCard(
  report: Report,
  streak?: string,
  bestScore?: string,
): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
  const blob = await renderReportCard(report, streak, bestScore)
  if (!blob) return 'failed'
  return shareBlob(blob, `serve-${dateStamp(report.createdAt)}.png`, 'My serve')
}

/**
 * Draw the basket's consistency as a single shareable image.
 *
 * "The share card is one serve; a coach wants the basket" — `renderReportCard`
 * says why a *comparison* never got a picture: half of one, shared without
 * the dates or serve numbers that give it meaning, is worse than none. That
 * reasoning does not reach this card, because nothing here is half of
 * anything. Every field on `Consistency` — the score, which serve was which,
 * the named differences between the best and the worst — already survives
 * without the clip; `ConsistencyPanel` proves it every time a stored report
 * reopens with no pictures and reads exactly the same. So this draws only
 * what a re-opened report could still show: no keyframe stills, which is
 * the same restraint `PairedFrames` already applies on screen, for the same
 * reason.
 *
 * Scoped the way `renderReportCard` scopes itself, not to everything
 * `ConsistencyPanel` renders. A basket can carry twenty measured spreads —
 * measured live, on the demo rig, at nineteen — and a card that printed
 * every one would not be a card a coach reads at the net, it would be the
 * panel again with a different frame around it. Named here instead: the one
 * element that wandered most and the one that held steadiest, which is what
 * `Consistency.weakest`/`.steadiest` already are.
 */
export async function renderBasketCard(
  consistency: Consistency,
  createdAt: number,
  /**
   * The tightest-gap record line, already worded by `bestGapLine`. Absent
   * below two baskets, same as the trend it is read from.
   */
  bestGap?: string,
  /**
   * How this basket's own gap compared to the one right before it, already
   * worded by `gapDeltaLine`. A different question from `bestGap` — see
   * `ConsistencyPanel`'s own prop of the same name.
   */
  gapDelta?: string,
): Promise<Blob | undefined> {
  const c = consistency
  const W = 1080
  const PAD = 64

  const canvas = document.createElement('canvas')
  canvas.width = W
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined

  /* --- layout ------------------------------------------------------------ */
  const cy = 250
  const ringR = 78
  const textX = PAD + 210
  const textW = W - textX - PAD

  ctx.font = font(400, 20)
  const headline = plain(consistencyHeadline(c))
  const headlineLines = headline ? layoutLines(ctx, headline, textW) : []
  const headlineEnd = cy + 20 + headlineLines.length * 30

  const chipY = Math.max(headlineEnd + 22, cy + ringR + 40)
  // Reserved above the comparison it qualifies, the same order `ConsistencyPanel`
  // draws it in — not a footnote a coach could read the score without.
  const handoffLines = c.possibleHandoff
    ? layoutLines(
        ctx,
        "These serves don't measure as the same height. If someone else served in this clip, this comparison is two people, not one player's consistency.",
        W - PAD * 2,
      )
    : []
  const handoffY = chipY + 46
  const gapY = handoffY + handoffLines.length * 24 + (handoffLines.length ? 22 : 24)

  // The best-against-worst block, laid out before the canvas is sized —
  // the same reason `renderReportCard` measures the focus paragraph first.
  const differences = c.gap
    ? c.gap.differences
        .map((d) => ({ ...d, best: readoutOf(d.id, d.bestValue), worst: readoutOf(d.id, d.worstValue) }))
        .filter((d) => d.best && d.worst && d.best !== d.worst)
        .slice(0, 3)
    : []
  const gapBlockH = c.gap ? 56 + differences.length * 62 + 20 : 0

  const notableY = gapY + gapBlockH
  const notables = [c.weakest, c.steadiest].filter(
    (m, i, arr): m is NonNullable<typeof m> => m !== undefined && arr.indexOf(m) === i,
  )
  const notableH = notables.length ? notables.length * 92 + 20 : 0

  const BEST_GAP_H = bestGap ? 34 : 0
  const GAP_DELTA_H = gapDelta ? 34 : 0
  const H = notableY + notableH + 90 + BEST_GAP_H + GAP_DELTA_H
  canvas.height = H

  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)

  const glow = ctx.createRadialGradient(W / 2, -140, 40, W / 2, -140, 760)
  glow.addColorStop(0, 'rgba(205,249,74,0.16)')
  glow.addColorStop(1, 'rgba(205,249,74,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, gapY)

  /* --- header -------------------------------------------------------------- */
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = LIME
  ctx.beginPath()
  ctx.arc(PAD + 9, PAD + 14, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = font(640, 24)
  ctx.fillStyle = FG
  ctx.fillText('Serve Coach', PAD + 30, PAD + 22)

  ctx.font = font(500, 20)
  ctx.fillStyle = FAINT
  ctx.textAlign = 'right'
  ctx.fillText(
    new Date(createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
    W - PAD,
    PAD + 22,
  )
  ctx.textAlign = 'left'

  /* --- consistency ring ----------------------------------------------------- */
  const cx = PAD + 92
  const status = STATUS_COLOR[c.status] ?? LIME

  ctx.lineWidth = 14
  ctx.strokeStyle = '#1b2130'
  ctx.beginPath()
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = status
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + (c.score / 100) * Math.PI * 2)
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.font = font(680, 54)
  ctx.fillStyle = FG
  ctx.fillText(String(c.score), cx, cy + 12)
  ctx.font = font(600, 14)
  ctx.fillStyle = FAINT
  ctx.fillText('REPEATABLE', cx, cy + 38)
  ctx.textAlign = 'left'

  /* --- headline -------------------------------------------------------------- */
  ctx.font = font(700, 16)
  ctx.fillStyle = LIME
  ctx.fillText('HOW REPEATABLE', textX, cy - 58)
  ctx.font = font(640, 34)
  ctx.fillStyle = FG
  ctx.fillText(`Across ${c.serves} serves`, textX, cy - 16)
  ctx.font = font(400, 20)
  ctx.fillStyle = MUTED
  drawLines(ctx, headlineLines, textX, cy + 20, 30)

  /* --- per-serve chips --------------------------------------------------- */
  let chipX = PAD
  ctx.font = font(560, 17)
  c.overallScores.forEach((score, i) => {
    const num = c.serveNumbers[i] ?? i + 1
    const label = `#${num}: ${score}`
    const w = ctx.measureText(label).width + 26
    if (chipX + w > W - PAD) return
    ctx.fillStyle = INK_2
    roundRect(ctx, chipX, chipY - 20, w, 34, 17)
    ctx.fill()
    ctx.fillStyle = MUTED
    ctx.fillText(label, chipX + 13, chipY + 3)
    chipX += w + 8
  })
  if (c.skipped > 0) {
    ctx.font = font(400, 15)
    ctx.fillStyle = FAINT
    ctx.fillText(
      `${c.skipped} ${c.skipped === 1 ? 'serve was' : 'serves were'} too unclear to measure.`,
      chipX + 8,
      chipY + 3,
    )
  }

  /* --- possible handoff --------------------------------------------------- */
  // A caution on the whole comparison below, not a refusal — see `Consistency
  // .possibleHandoff`. Left out of this card would mean the one thing that
  // says "maybe two people, not one player's consistency" survives on screen
  // and not in the coach's pocket, which is exactly the gap this card exists
  // to close in the other direction.
  if (handoffLines.length) {
    ctx.font = font(500, 16)
    ctx.fillStyle = STATUS_COLOR.fair
    drawLines(ctx, handoffLines, PAD, handoffY, 24)
  }

  /* --- best against worst ------------------------------------------------ */
  if (c.gap) {
    ctx.font = font(700, 16)
    ctx.fillStyle = LIME
    ctx.fillText('BEST AGAINST WORST', PAD, gapY)
    ctx.font = font(400, 19)
    ctx.fillStyle = FG
    ctx.fillText(
      `Serve #${c.gap.best} scored ${c.gap.bestScore}. Serve #${c.gap.worst} scored ${c.gap.worstScore}.`,
      PAD,
      gapY + 34,
    )

    // Stacked, not side by side. A fixed gap between two right-aligned values
    // collides the moment one of them measures wider than the gap — "Struck
    // at full racket reach" against "Struck below full reach" already did,
    // on the demo rig's own basket. Each value gets the full width instead,
    // so nothing here depends on how long the coaching phrase turns out to be.
    let dy = gapY + 66
    for (const d of differences) {
      ctx.font = font(500, 16)
      ctx.fillStyle = MUTED
      ctx.fillText(d.label, PAD, dy)
      ctx.font = font(500, 17)
      ctx.fillStyle = status
      ctx.fillText(`#${c.gap.best}: ${d.best}`, PAD + 20, dy + 26)
      ctx.fillStyle = FAINT
      ctx.textAlign = 'right'
      ctx.fillText(`#${c.gap.worst}: ${d.worst}`, W - PAD, dy + 26)
      ctx.textAlign = 'left'
      dy += 62
    }
  }

  /* --- weakest / steadiest ------------------------------------------------ */
  let noteY = notableY
  for (const m of notables) {
    const isWeakest = m === c.weakest
    ctx.fillStyle = INK_2
    roundRect(ctx, PAD, noteY, W - PAD * 2, 78, 16)
    ctx.fill()

    ctx.font = font(700, 15)
    ctx.fillStyle = isWeakest ? STATUS_COLOR.work : STATUS_COLOR.great
    ctx.fillText(isWeakest ? 'WANDERS MOST' : 'HOLDS STEADIEST', PAD + 24, noteY + 30)
    ctx.font = font(560, 21)
    ctx.fillStyle = FG
    ctx.fillText(m.label, PAD + 24, noteY + 58)

    const low = readoutOf(m.id, m.min)
    const high = readoutOf(m.id, m.max)
    ctx.font = font(400, 18)
    ctx.fillStyle = MUTED
    ctx.textAlign = 'right'
    ctx.fillText(low === high ? `Every serve: ${low}` : `${low} → ${high}`, W - PAD - 24, noteY + 46)
    ctx.textAlign = 'left'

    noteY += 92
  }

  /* --- footer -------------------------------------------------------------- */
  // Above the caption rather than beside the score, for the same reason
  // `renderReportCard` places the trip streak above its drill box: a fact
  // about the whole history, not about this one basket. Since-last-time sits
  // above the all-time record, the same top-to-bottom order `ConsistencyPanel`
  // renders the two facts in on screen.
  let footerY = H - 22 - (bestGap ? 34 : 0) - (gapDelta ? 34 : 0)
  if (gapDelta) {
    ctx.font = font(560, 16)
    ctx.fillStyle = MUTED
    ctx.textAlign = 'center'
    ctx.fillText(gapDelta, W / 2, footerY)
    ctx.textAlign = 'left'
    footerY += 34
  }
  if (bestGap) {
    ctx.font = font(560, 16)
    ctx.fillStyle = LIME
    ctx.textAlign = 'center'
    ctx.fillText(bestGap, W / 2, footerY)
    ctx.textAlign = 'left'
  }

  ctx.font = font(400, 15)
  ctx.fillStyle = FAINT
  ctx.textAlign = 'center'
  ctx.fillText('Measured on your phone · the video never left it', W / 2, H - 22)
  ctx.textAlign = 'left'

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/png'))
}

export async function shareBasketCard(
  consistency: Consistency,
  createdAt: number,
  bestGap?: string,
  gapDelta?: string,
): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
  const blob = await renderBasketCard(consistency, createdAt, bestGap, gapDelta)
  if (!blob) return 'failed'
  return shareBlob(blob, `basket-${dateStamp(createdAt)}.png`, 'My basket')
}

/**
 * The cross-session records, already worded by their own `*EverLine`
 * functions — see `bestGapEverLine`/`bestTripEverLine`/
 * `streakLine` in `progress.ts`. Every field
 * optional for the same reason each already is on its own screen: a player
 * with one trip, or one basket, has none of these yet.
 */
export interface SeasonRecords {
  streak?: string
  longestStreak?: string
  bestScore?: string
  bestGap?: string
}

/**
 * Draw every cross-session record together as a single shareable image.
 *
 * Every other card here is scoped to one report or one basket, with at most
 * one or two of these four riding along as a secondary line. Nothing draws
 * the whole season on its own — a coach or a parent asked "how's it going"
 * has only a single day's report to hand over, never the four facts that
 * only move by actually getting on court, which the progress sheet already
 * groups together in one place but never lets leave the app.
 *
 * No score ring, unlike every other card: there is no single number a
 * season reduces to without inventing one. Each record is its own row
 * instead, in the same order the progress sheet already renders them in —
 * `streak`, `longestStreak`, `bestScore`, `bestGap` — so the
 * card says nothing the screen it was shared from does not already say,
 * and in the same order a player would find it in.
 *
 * `undefined` with nothing to show, the same floor `renderBasketCard`
 * holds for a basket with no gap yet — a card with zero rows is not a
 * smaller card, it is a blank one.
 */
export async function renderSeasonCard(records: SeasonRecords, asOf: number): Promise<Blob | undefined> {
  const rows = [
    records.streak,
    records.longestStreak,
    records.bestScore,
    records.bestGap,
  ].filter((line): line is string => Boolean(line))
  if (rows.length === 0) return undefined

  const W = 1080
  const PAD = 64
  const ROW_GAP = 18
  const ROW_PAD_Y = 28

  const canvas = document.createElement('canvas')
  canvas.width = W
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined

  /* --- layout, measured before the canvas is sized ------------------------ */
  const titleY = PAD + 108
  const rowsY = titleY + 56
  const rowTextFont = font(560, 22)
  const rowMaxWidth = W - PAD * 2 - 48

  ctx.font = rowTextFont
  const rowLines = rows.map((line) => layoutLines(ctx, line, rowMaxWidth))
  const rowHeights = rowLines.map((lines) => ROW_PAD_Y * 2 + lines.length * 30)
  const rowsH = rowHeights.reduce((s, h) => s + h, 0) + ROW_GAP * (rows.length - 1)

  const H = rowsY + rowsH + 74
  canvas.height = H

  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)

  const glow = ctx.createRadialGradient(W / 2, -140, 40, W / 2, -140, 760)
  glow.addColorStop(0, 'rgba(205,249,74,0.16)')
  glow.addColorStop(1, 'rgba(205,249,74,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, rowsY)

  /* --- header -------------------------------------------------------------- */
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = LIME
  ctx.beginPath()
  ctx.arc(PAD + 9, PAD + 14, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = font(640, 24)
  ctx.fillStyle = FG
  ctx.fillText('Serve Coach', PAD + 30, PAD + 22)

  ctx.font = font(500, 20)
  ctx.fillStyle = FAINT
  ctx.textAlign = 'right'
  ctx.fillText(
    new Date(asOf).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
    W - PAD,
    PAD + 22,
  )
  ctx.textAlign = 'left'

  /* --- title ----------------------------------------------------------------- */
  ctx.font = font(700, 16)
  ctx.fillStyle = LIME
  ctx.fillText('YOUR SEASON SO FAR', PAD, titleY)

  /* --- one row per record ---------------------------------------------------- */
  let y = rowsY
  rowLines.forEach((lines, i) => {
    const h = rowHeights[i]
    ctx.fillStyle = INK_2
    roundRect(ctx, PAD, y, W - PAD * 2, h, 16)
    ctx.fill()

    ctx.font = rowTextFont
    ctx.fillStyle = FG
    drawLines(ctx, lines, PAD + 24, y + ROW_PAD_Y + 18, 30)

    y += h + ROW_GAP
  })

  ctx.font = font(400, 15)
  ctx.fillStyle = FAINT
  ctx.textAlign = 'center'
  ctx.fillText('Measured on your phone · the video never left it', W / 2, H - 22)
  ctx.textAlign = 'left'

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/png'))
}

export async function shareSeasonCard(
  records: SeasonRecords,
  asOf: number,
): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
  const blob = await renderSeasonCard(records, asOf)
  if (!blob) return 'failed'
  return shareBlob(blob, `season-${dateStamp(asOf)}.png`, 'My season')
}

/* ------------------------------------------------------- a trip, for a coach */

/**
 * One trip to the court, as an image somebody can send their coach.
 *
 * R58·2. Its content was decided in R58·1 — `tripSummary` in `progress.ts` —
 * and this only draws it. Nothing here computes anything about a serve, which
 * is the whole reason the split was worth taking: a layout argument and a truth
 * argument in one function is how a card ends up asserting something the report
 * behind it never said.
 *
 * EVERY TOKEN IS ONE THIS FILE ALREADY HAD. No new colour, no new size ramp —
 * constraint 3, and this surface has less claim on a new one than most, since it
 * exists to be screenshotted into a message thread.
 *
 * WHAT IT DELIBERATELY DOES NOT DRAW: any image of a person. The basket card
 * carries no stills either, and for the same reason — a coach's card travels
 * further than a report ever does, and the one thing this app promises is that
 * pictures of somebody serving stay on their phone. Numbers and words only.
 */
export async function renderTripCard(
  trip: TripSummary,
  /** The recurring-strain line, already worded by the caller. Absent is normal. */
  strainLine?: string,
): Promise<Blob | undefined> {
  const W = 1080
  const PAD = 64

  const canvas = document.createElement('canvas')
  canvas.width = W
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined

  /*
   * Measured before the height is set, exactly as the other two cards do. A
   * canvas resize clears it, so every wrap has to be known first — and the card
   * is variable-height by construction, because the strain line and the
   * repeatability reading are both routinely absent.
   */
  ctx.font = font(400, 30)
  const focusLines = trip.focus ? layoutLines(ctx, trip.focus, W - PAD * 2) : []
  const strainLines = strainLine ? layoutLines(ctx, plain(strainLine), W - PAD * 2) : []

  const bodyTop = 300
  const rowH = 92
  const rows = trip.tightestGap === undefined ? 2 : 3
  const focusTop = bodyTop + rows * rowH + 28
  const strainTop = focusTop + focusLines.length * 42 + (focusLines.length ? 36 : 0)
  const H = strainTop + strainLines.length * 42 + (strainLines.length ? 28 : 0) + PAD

  canvas.height = H
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)

  /* --- the heading ------------------------------------------------------- */
  ctx.fillStyle = FAINT
  ctx.font = font(700, 24)
  ctx.fillText('ONE TRIP TO THE COURT', PAD, 96)

  ctx.fillStyle = FG
  ctx.font = font(700, 64)
  ctx.fillText(dateStamp(trip.from), PAD, 176)

  ctx.fillStyle = MUTED
  ctx.font = font(400, 30)
  ctx.fillText(`${trip.serves} ${trip.serves === 1 ? 'serve' : 'serves'} filmed`, PAD, 228)

  /* --- the rows ---------------------------------------------------------- */
  const row = (i: number, label: string, value: string, accent = FG) => {
    const y = bodyTop + i * rowH
    ctx.fillStyle = INK_2
    roundRect(ctx, PAD, y, W - PAD * 2, rowH - 16, 18)
    ctx.fill()
    ctx.fillStyle = MUTED
    ctx.font = font(400, 26)
    ctx.fillText(label, PAD + 28, y + 34)
    ctx.fillStyle = accent
    ctx.font = font(700, 34)
    ctx.textAlign = 'right'
    ctx.fillText(value, W - PAD - 28, y + 36)
    ctx.textAlign = 'left'
  }

  row(0, 'Best serve', String(trip.best.overall), LIME)
  row(1, 'Toughest serve', String(trip.worst.overall))
  /*
   * Absent rather than zero when nothing on the trip was swept — R58·1's
   * refusal, carried through to the pixels. A row reading "0" would say the
   * player was perfectly repeatable on a trip nobody measured repeatability on,
   * which is the confident nonsense the whole split exists to keep out of an
   * image that travels.
   */
  if (trip.tightestGap !== undefined) {
    row(2, 'Tightest basket', `${trip.tightestGap} apart`)
  }

  /* --- what they left with ----------------------------------------------- */
  if (focusLines.length) {
    ctx.fillStyle = FAINT
    ctx.font = font(700, 22)
    ctx.fillText('WORKING ON', PAD, focusTop - 14)
    ctx.fillStyle = FG
    ctx.font = font(400, 30)
    drawLines(ctx, focusLines, PAD, focusTop + 24, 42)
  }

  if (strainLines.length) {
    ctx.fillStyle = MUTED
    ctx.font = font(400, 28)
    drawLines(ctx, strainLines, PAD, strainTop + 22, 42)
  }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/png'))
}

/** The trip card, handed to the share sheet. */
export async function shareTripCard(
  trip: TripSummary,
  strainLine?: string,
): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
  const blob = await renderTripCard(trip, strainLine)
  if (!blob) return 'failed'
  return shareBlob(blob, `trip-${dateStamp(trip.from)}.png`, 'My trip')
}

/* ------------------------------------------------ a fault, fixed (L3.12) -- */

/** A tracked body's extent in normalised frame units, x divided back out of the aspect. */
function extent(pose: CardPose) {
  const xs = pose.frame.image.map((l) => l.x / pose.aspect).filter(Number.isFinite)
  const ys = pose.frame.image.map((l) => l.y).filter(Number.isFinite)
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

/**
 * The largest scale, in pixels per normalised x, at which every figure fits
 * its panel. One scale for both, so the two bodies are drawn the same size
 * and the difference between them is the serve, not the fit.
 */
function sharedScale(poses: CardPose[], w: number, h: number): number {
  return Math.min(
    ...poses.map((p) => {
      const e = extent(p)
      return Math.min((w * 0.8) / Math.max(1e-3, e.x1 - e.x0), (h * 0.82 * p.aspect) / Math.max(1e-3, e.y1 - e.y0))
    }),
  )
}

/** A figure centred in its panel at a given scale; y gets it over the aspect, so nothing stretches. */
function figureRect(pose: CardPose, dw: number, x: number, y: number, w: number, h: number): DrawRect {
  const e = extent(pose)
  const dh = dw / pose.aspect
  return { ox: x + w / 2 - ((e.x0 + e.x1) / 2) * dw, oy: y + h / 2 - ((e.y0 + e.y1) / 2) * dh, dw, dh }
}

/**
 * The graduation card: the fault's name, the line it earned, and the body at
 * the moment the fault is judged — a serve that showed it beside the newest
 * that did not, each dated. Figures, not photographs: see `graduationCard`.
 */
export async function renderGraduationCard(card: GraduationCard): Promise<Blob | undefined> {
  const W = 1080
  const PAD = 64
  const canvas = document.createElement('canvas')
  canvas.width = W
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined

  ctx.font = font(400, 30)
  const lines = layoutLines(ctx, plain(card.line), W - PAD * 2)
  const panelTop = 236 + lines.length * 42 + 28
  const panelH = 600
  const gap = 24
  const panelW = (W - PAD * 2 - gap) / 2
  const H = panelTop + panelH + 72 + PAD
  canvas.height = H
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = LIME
  ctx.font = font(700, 24)
  ctx.fillText('FIXED', PAD, 96)
  ctx.fillStyle = FG
  ctx.font = font(700, 64)
  ctx.fillText(card.name, PAD, 176)
  ctx.fillStyle = MUTED
  ctx.font = font(400, 30)
  drawLines(ctx, lines, PAD, 236, 42)

  const scale = sharedScale([card.then, card.now], panelW, panelH)
  const panel = (i: number, pose: CardPose, caption: string) => {
    const x = PAD + i * (panelW + gap)
    ctx.fillStyle = INK_2
    roundRect(ctx, x, panelTop, panelW, panelH, 24)
    ctx.fill()
    drawSkeleton(ctx, {
      frame: pose.frame,
      aspect: pose.aspect,
      racket: pose.racket,
      rect: figureRect(pose, scale, x, panelTop, panelW, panelH),
    })
    ctx.fillStyle = FAINT
    ctx.font = font(700, 22)
    ctx.fillText(caption, x + 8, panelTop + panelH + 44)
  }
  panel(0, card.then, `THEN · ${dateStamp(card.then.at)}`)
  panel(1, card.now, `NOW · ${dateStamp(card.now.at)}`)

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/png'))
}

/** The graduation card, handed to the share sheet — the only way it leaves the phone. */
export async function shareGraduationCard(
  card: GraduationCard,
): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
  const blob = await renderGraduationCard(card)
  if (!blob) return 'failed'
  return shareBlob(blob, `fixed-${card.flaw}-${dateStamp(card.now.at)}.png`, `${card.name}: fixed`)
}
