/**
 * Light from the pixels (METRICS §1.3 condition classes, §3.25 `exposure` and `flicker`; CAPTURE
 * `cq.flicker`), for finding 21: the class no longer rests on the player's answer alone.
 *
 * Input: a coarse luma grid per frame, taken on the sparse pass (pipeline/passes.ts: every frame the
 * serve scan decodes, drawn to LUMA_GRID × LUMA_GRID cells). Cells covered by the player (from that
 * frame's pose, when known) are left out, so the background is what is measured, as CAPTURE asks.
 *
 *   - Flicker: the relative amplitude of the mains flicker (100 Hz, Australian 50 Hz mains) at its
 *     alias. The sparse pass samples every k-th frame (15 Hz fill, 4 Hz coarse scan), so the alias is
 *     taken for each run of evenly spaced frames: sampling rate fs = captureFps / step, alias
 *     |100 − round(100 / fs)·fs|. The coarse scan (4 Hz) sees 100 Hz at one phase (alias 0) and is not
 *     used; the 15 Hz fill sees it at 5 Hz. Each run of at least 2 s (FLICKER_MIN_RUN_S) gives
 *     A = 2·|Σ (x − moving mean) e^{−2πi f n / fs}| / (N·mean), scanned over ±0.5 Hz (mains drift,
 *     clock error). The clip's amplitude is the median over the runs. A ≥ 3% is a warning: class
 *     `flicker`, `speed-experimental` blocked (FLICKER, §3.25); 1–3% is info.
 *   - Darkness: court lights leave the sky (the top rows of the background) far darker than the lit
 *     court and player, where daylight makes the sky the brightest part of the picture. Each frame's
 *     band is the median of its cells (a floodlight or a patch of sky in the band does not move it),
 *     and the clip is `dark` when the median top band is below DARK_SKY_LUMA AND below DARK_SKY_RATIO
 *     of the bottom band: near-black, and far darker than the court. Both, so that a dark windbreak
 *     above a sunlit court (dim, but not black) is not taken for night: on the synthetic corpus
 *     (tools/validate/light-eval.ts; validation/results/light/SUMMARY.md, 124 clips) night skies read 0
 *     against a court at 170, and the darkest daylight top band (a fence filling the top of the low
 *     4.5 m apexout set-up) 29 against 94, which a 40 / 0.35 rule called night. The thresholds sit
 *     between those; they are initial values, not calibrated on real courts, and a miss only leaves
 *     the class to the player's answer.
 *
 * Pixel evidence only ever LOWERS the class (day → night-lights or flicker): a bright picture never
 * turns an unknown or a court-lights answer into daylight.
 */

/** Cells per side of the luma grid. */
export const LUMA_GRID = 16
/** Mains flicker frequency (Hz): 2 × 50 Hz mains (Australia). */
export const FLICKER_HZ = 100
/** Warning threshold on the relative flicker amplitude (CAPTURE `flickerAmp.warn`). */
export const FLICKER_WARN = 0.03
/** Info threshold (CAPTURE `flickerAmp.info`). */
export const FLICKER_INFO = 0.01
/** Shortest run of evenly spaced frames that is searched for flicker (s). */
export const FLICKER_MIN_RUN_S = 2
/** Fewest samples in a run (a 15 Hz fill run of 2 s has 30). */
export const FLICKER_MIN_SAMPLES = 20
/** An alias this close to 0 Hz (25, 50, 100 fps; the 4 Hz coarse scan) cannot show flicker. */
const MIN_ALIAS_HZ = 1
/** The top band (sky, far fence) darker than this (0–255 luma) ... [synthetic corpus: night 0, darkest daylight 29] */
export const DARK_SKY_LUMA = 18
/** ... and darker than this share of the bottom band (court) means court lights. [night 0/170, darkest daylight 29/94] */
export const DARK_SKY_RATIO = 0.2
/** Fewest frames for any light evidence. */
export const LIGHT_MIN_FRAMES = 8

export interface LumaFrame {
  frameIndex: number
  tReal: number
  /** LUMA_GRID × LUMA_GRID mean luma (0–255), row-major, top row first, in display orientation. */
  grid: ArrayLike<number>
}

/** The player's box in a frame (normalised display coordinates), to leave out of the background. */
export type PlayerBoxAt = (frameIndex: number) => { x0: number; y0: number; x1: number; y1: number } | null

export interface FlickerEstimate {
  /** Median relative amplitude over the usable runs (0–1). */
  amplitude: number
  /** Runs of evenly spaced frames that could show flicker. */
  runs: number
  /** Alias frequencies searched (Hz), one per run. */
  aliasHz: number[]
}

export interface LightEvidence {
  frames: number
  /** Median background luma (0–255). */
  backgroundLuma: number
  /** Median luma of the background's top and bottom bands (0–255). */
  skyLuma: number
  groundLuma: number
  /** Median luma inside the player's box, when poses were given. */
  subjectLuma?: number
  /** Null when no run of frames could show flicker (too short, or a frame rate that hides it). */
  flicker: FlickerEstimate | null
  /** Court lights by the picture: a dark sky over a lit court. */
  dark: boolean
  /** Mains flicker at or above FLICKER_WARN. */
  flickering: boolean
}

function median(xs: readonly number[]): number {
  if (!xs.length) return Number.NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN
}

/** Per frame: background mean, top and bottom band medians, and the subject's mean. */
function frameStats(f: LumaFrame, box: ReturnType<PlayerBoxAt>): { bg: number; top: number; bottom: number; subject?: number } {
  const n = LUMA_GRID
  const bg: number[] = []
  const top: number[] = []
  const bottom: number[] = []
  const subj: number[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = f.grid[r * n + c]
      if (v === undefined || !Number.isFinite(v)) continue
      const x0 = c / n
      const x1 = (c + 1) / n
      const y0 = r / n
      const y1 = (r + 1) / n
      const inBox = !!box && x1 > box.x0 && x0 < box.x1 && y1 > box.y0 && y0 < box.y1
      if (inBox) {
        subj.push(v)
        continue
      }
      bg.push(v)
      if (r < n / 4) top.push(v)
      else if (r >= (3 * n) / 4) bottom.push(v)
    }
  }
  return { bg: mean(bg), top: median(top), bottom: median(bottom), ...(subj.length ? { subject: mean(subj) } : {}) }
}

/**
 * Relative amplitude of a sinusoid at `f` Hz in samples x[n] taken at `fs` Hz, after removing a centred
 * moving mean one alias period long (which leaves the alias whole and removes slow light changes).
 */
export function toneAmplitude(x: readonly number[], fs: number, f: number): number {
  const N = x.length
  const m = mean(x)
  if (!(N >= 3) || !(m > 0)) return 0
  const w = Math.max(3, Math.round(fs / Math.max(f, 1e-6)))
  const half = Math.floor(w / 2)
  let re = 0
  let im = 0
  let used = 0
  for (let n = half; n < N - half; n++) {
    let s = 0
    for (let k = n - half; k < n - half + w && k < N; k++) s += x[k]
    const d = x[n] - s / w
    const ph = (2 * Math.PI * f * n) / fs
    re += d * Math.cos(ph)
    im -= d * Math.sin(ph)
    used++
  }
  if (!used) return 0
  return (2 * Math.hypot(re, im)) / (used * m)
}

/** The alias of `hz` when sampled at `fs` (0 … fs/2). */
export function aliasOf(hz: number, fs: number): number {
  const r = hz - Math.round(hz / fs) * fs
  return Math.abs(r)
}

/**
 * Mains flicker from a background-luma series (frame index, value), captured at `captureFps`. Runs
 * of evenly spaced frames (same index step) of at least FLICKER_MIN_RUN_S and FLICKER_MIN_SAMPLES are
 * searched at their alias of FLICKER_HZ, ±0.5 Hz; null when no run can show flicker.
 */
export function flickerFrom(series: readonly { frameIndex: number; value: number }[], captureFps: number): FlickerEstimate | null {
  if (!(captureFps > 0) || series.length < FLICKER_MIN_SAMPLES) return null
  const s = [...series].filter((p) => Number.isFinite(p.value)).sort((a, b) => a.frameIndex - b.frameIndex)
  // Runs of evenly spaced frames. The sparse pass mixes its 4 Hz scan into the 15 Hz fill (the fill
  // skips frames the scan already has), so runs are taken on each frame grid: for the commonest steps,
  // the frames on one residue of that step, split where a frame is missing.
  const diffs = new Map<number, number>()
  for (let i = 1; i < s.length; i++) {
    const d = s[i].frameIndex - s[i - 1].frameIndex
    if (d > 0) diffs.set(d, (diffs.get(d) ?? 0) + 1)
  }
  const steps = [...diffs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([d]) => d)
  const runs: { step: number; values: number[] }[] = []
  for (const step of steps) {
    const byResidue = new Map<number, { frameIndex: number; value: number }[]>()
    for (const p of s) {
      const r = p.frameIndex % step
      const list = byResidue.get(r)
      if (list) list.push(p)
      else byResidue.set(r, [p])
    }
    for (const list of byResidue.values()) {
      let values: number[] = []
      for (let i = 0; i < list.length; i++) {
        if (i > 0 && list[i].frameIndex - list[i - 1].frameIndex !== step) {
          if (values.length) runs.push({ step, values })
          values = []
        }
        values.push(list[i].value)
      }
      if (values.length) runs.push({ step, values })
    }
  }
  const amps: number[] = []
  const aliasHz: number[] = []
  for (const run of runs) {
    const fs = captureFps / run.step
    const alias = aliasOf(FLICKER_HZ, fs)
    if (alias < MIN_ALIAS_HZ || run.values.length < FLICKER_MIN_SAMPLES || run.values.length / fs < FLICKER_MIN_RUN_S) continue
    // Split long runs into ~2–4 s windows (the flicker phase drifts with the mains frequency).
    const win = Math.max(FLICKER_MIN_SAMPLES, Math.round(3 * fs))
    for (let a = 0; a + FLICKER_MIN_SAMPLES <= run.values.length; a += win) {
      const seg = run.values.slice(a, Math.min(run.values.length, a + win))
      if (seg.length < FLICKER_MIN_SAMPLES || seg.length / fs < FLICKER_MIN_RUN_S * 0.75) continue
      let best = 0
      for (let d = -0.5; d <= 0.5 + 1e-9; d += 0.05) {
        const f = Math.abs(alias + d)
        if (f < MIN_ALIAS_HZ * 0.5 || f > fs / 2) continue
        best = Math.max(best, toneAmplitude(seg, fs, f))
      }
      amps.push(best)
      aliasHz.push(alias)
    }
  }
  if (!amps.length) return null
  return { amplitude: median(amps), runs: amps.length, aliasHz }
}

/** The clip's light evidence from its sparse-pass luma grids (null with too few frames). */
export function lightEvidence(frames: readonly LumaFrame[], opts: { captureFps: number; playerBox?: PlayerBoxAt }): LightEvidence | null {
  if (frames.length < LIGHT_MIN_FRAMES) return null
  const stats = frames.map((f) => ({ f, s: frameStats(f, opts.playerBox?.(f.frameIndex) ?? null) }))
  const backgroundLuma = median(stats.map((x) => x.s.bg).filter(Number.isFinite))
  const skyLuma = median(stats.map((x) => x.s.top).filter(Number.isFinite))
  const groundLuma = median(stats.map((x) => x.s.bottom).filter(Number.isFinite))
  const subjects = stats.map((x) => x.s.subject).filter((v): v is number => v !== undefined && Number.isFinite(v))
  const flicker = flickerFrom(
    stats.map((x) => ({ frameIndex: x.f.frameIndex, value: x.s.bg })),
    opts.captureFps,
  )
  const dark = Number.isFinite(skyLuma) && Number.isFinite(groundLuma) && skyLuma < DARK_SKY_LUMA && skyLuma < DARK_SKY_RATIO * groundLuma
  return {
    frames: frames.length,
    backgroundLuma,
    skyLuma,
    groundLuma,
    ...(subjects.length ? { subjectLuma: median(subjects) } : {}),
    flicker,
    dark,
    flickering: !!flicker && flicker.amplitude >= FLICKER_WARN,
  }
}

/** Mean luma of an RGBA pixel block, BT.601 weights. */
export function lumaGridFromRgba(data: ArrayLike<number>, width: number, height: number): Uint8Array {
  const n = LUMA_GRID
  const out = new Uint8Array(n * n)
  const sums = new Float64Array(n * n)
  const counts = new Uint32Array(n * n)
  for (let y = 0; y < height; y++) {
    const r = Math.min(n - 1, Math.floor((y * n) / height))
    for (let x = 0; x < width; x++) {
      const c = Math.min(n - 1, Math.floor((x * n) / width))
      const j = (y * width + x) * 4
      sums[r * n + c] += 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]
      counts[r * n + c]++
    }
  }
  for (let k = 0; k < n * n; k++) out[k] = counts[k] ? Math.round(sums[k] / counts[k]) : 0
  return out
}
