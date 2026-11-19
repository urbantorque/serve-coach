/**
 * Just enough of WebM to hold frames from the browser's own video encoder, each
 * on the exact time it was drawn for (N2.8).
 *
 * Dev only: the pipeline bench (`pipeline.ts`) draws a serve frame by frame and
 * needs a file the app reads like any other clip. A canvas recorded through
 * `MediaRecorder` stamps frames with the wall clock, which on a busy machine is
 * not the time a frame was drawn for (N2.3 found copies that stopped early), and
 * a frame filed at the wrong instant would be scored against the wrong truth. So
 * the frames go through `VideoEncoder` with their timestamps set by hand, and
 * this writes them out.
 *
 * One video track, millisecond timecodes, a cluster per key frame, a duration
 * and a cue per cluster so the browser can seek. Nothing else of Matroska.
 */

/** One encoded frame, as `EncodedVideoChunk` hands it over. */
export interface WebmFrame {
  /** Microseconds, as WebCodecs counts. */
  timestamp: number
  key: boolean
  data: Uint8Array
}

export interface WebmTrack {
  /** Matroska's codec id: `V_VP8` or `V_VP9`. */
  codec: string
  width: number
  height: number
  /** Frames a second, for the track's default duration. */
  fps: number
}

const ID = {
  ebml: 0x1a45dfa3,
  ebmlVersion: 0x4286,
  ebmlReadVersion: 0x42f7,
  maxIdLength: 0x42f2,
  maxSizeLength: 0x42f3,
  docType: 0x4282,
  docTypeVersion: 0x4287,
  docTypeReadVersion: 0x4285,
  segment: 0x18538067,
  seekHead: 0x114d9b74,
  seek: 0x4dbb,
  seekId: 0x53ab,
  seekPosition: 0x53ac,
  info: 0x1549a966,
  timecodeScale: 0x2ad7b1,
  duration: 0x4489,
  muxingApp: 0x4d80,
  writingApp: 0x5741,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  trackUid: 0x73c5,
  trackType: 0x83,
  codecId: 0x86,
  flagLacing: 0x9c,
  defaultDuration: 0x23e383,
  video: 0xe0,
  pixelWidth: 0xb0,
  pixelHeight: 0xba,
  cluster: 0x1f43b675,
  timecode: 0xe7,
  simpleBlock: 0xa3,
  cues: 0x1c53bb6b,
  cuePoint: 0xbb,
  cueTime: 0xb3,
  cueTrackPositions: 0xb7,
  cueTrack: 0xf7,
  cueClusterPosition: 0xf1,
} as const

/** An element id's own bytes: the length marker is part of the id. */
export function idBytes(id: number): Uint8Array {
  const out: number[] = []
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 0xff)
  return Uint8Array.from(out)
}

/** A size as an EBML variable-length integer, in the fewest bytes, or `width` bytes when given. */
export function sizeBytes(n: number, width?: number): Uint8Array {
  let len = width ?? 1
  if (width === undefined) while (len < 8 && n >= 2 ** (7 * len) - 1) len++
  const out = new Uint8Array(len)
  let v = n
  for (let i = len - 1; i >= 0; i--) {
    out[i] = v & 0xff
    v = Math.floor(v / 256)
  }
  out[0] |= 1 << (8 - len)
  return out
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

const element = (id: number, ...body: Uint8Array[]): Uint8Array => {
  const payload = concat(body)
  return concat([idBytes(id), sizeBytes(payload.length), payload])
}

/** An unsigned integer, big-endian, in `width` bytes or the fewest that hold it. */
function uintBytes(v: number, width?: number): Uint8Array {
  let len = width ?? 1
  if (width === undefined) while (len < 8 && v >= 2 ** (8 * len)) len++
  const out = new Uint8Array(len)
  let x = v
  for (let i = len - 1; i >= 0; i--) {
    out[i] = x & 0xff
    x = Math.floor(x / 256)
  }
  return out
}

const uint = (id: number, v: number, width?: number) => element(id, uintBytes(v, width))
const text = (id: number, s: string) => element(id, Uint8Array.from(s, (c) => c.charCodeAt(0)))
function float(id: number, v: number): Uint8Array {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setFloat64(0, v)
  return element(id, b)
}

/** A frame inside its cluster: track 1, its time from the cluster's, a key flag, the data. */
function simpleBlock(frame: WebmFrame, clusterMs: number): Uint8Array {
  const head = new Uint8Array(4)
  head[0] = 0x81
  new DataView(head.buffer).setInt16(1, Math.round(frame.timestamp / 1000) - clusterMs)
  head[3] = frame.key ? 0x80 : 0
  return element(ID.simpleBlock, head, frame.data)
}

/**
 * The file, whole. Frames in decode order, the first a key frame. A SeekHead
 * points at the track, the info and the cues, with eight-byte positions so its
 * size is known before they are.
 */
export function muxWebm(track: WebmTrack, frames: readonly WebmFrame[]): Uint8Array {
  if (!frames.length || !frames[0].key) throw new Error('a WebM must open on a key frame')
  const header = element(
    ID.ebml,
    uint(ID.ebmlVersion, 1),
    uint(ID.ebmlReadVersion, 1),
    uint(ID.maxIdLength, 4),
    uint(ID.maxSizeLength, 8),
    text(ID.docType, 'webm'),
    uint(ID.docTypeVersion, 2),
    uint(ID.docTypeReadVersion, 2),
  )
  const last = frames[frames.length - 1]
  const durationMs = last.timestamp / 1000 + 1000 / track.fps
  const info = element(
    ID.info,
    uint(ID.timecodeScale, 1_000_000),
    float(ID.duration, durationMs),
    text(ID.muxingApp, 'serve-coach bench'),
    text(ID.writingApp, 'serve-coach bench'),
  )
  const tracks = element(
    ID.tracks,
    element(
      ID.trackEntry,
      uint(ID.trackNumber, 1),
      uint(ID.trackUid, 1),
      uint(ID.trackType, 1),
      text(ID.codecId, track.codec),
      uint(ID.flagLacing, 0),
      uint(ID.defaultDuration, Math.round(1e9 / track.fps)),
      element(ID.video, uint(ID.pixelWidth, track.width), uint(ID.pixelHeight, track.height)),
    ),
  )

  // A cluster opens on each key frame.
  const clusters: { ms: number; bytes: Uint8Array }[] = []
  let open: { ms: number; blocks: Uint8Array[] } | undefined
  const close = () => {
    if (open) clusters.push({ ms: open.ms, bytes: element(ID.cluster, uint(ID.timecode, open.ms), ...open.blocks) })
  }
  for (const f of frames) {
    const ms = Math.round(f.timestamp / 1000)
    if (f.key || !open || ms - open.ms > 30_000) {
      close()
      open = { ms, blocks: [] }
    }
    open.blocks.push(simpleBlock(f, open.ms))
  }
  close()

  const seekEntry = (id: number, pos: number) => element(ID.seek, element(ID.seekId, idBytes(id)), uint(ID.seekPosition, pos, 8))
  const seekHeadOf = (pInfo: number, pTracks: number, pCues: number) =>
    element(ID.seekHead, seekEntry(ID.info, pInfo), seekEntry(ID.tracks, pTracks), seekEntry(ID.cues, pCues))
  // Positions count from the start of the segment's payload.
  const seekLength = seekHeadOf(0, 0, 0).length
  const infoAt = seekLength
  const tracksAt = infoAt + info.length
  let at = tracksAt + tracks.length
  const clusterAt: number[] = []
  for (const c of clusters) {
    clusterAt.push(at)
    at += c.bytes.length
  }
  const cuesAt = at
  const cues = element(
    ID.cues,
    ...clusters.map((c, i) =>
      element(
        ID.cuePoint,
        uint(ID.cueTime, c.ms),
        element(ID.cueTrackPositions, uint(ID.cueTrack, 1), uint(ID.cueClusterPosition, clusterAt[i])),
      ),
    ),
  )
  const segment = element(ID.segment, seekHeadOf(infoAt, tracksAt, cuesAt), info, tracks, ...clusters.map((c) => c.bytes), cues)
  return concat([header, segment])
}
