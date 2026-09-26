/**
 * Minimal QuickTime metadata reader over raw `moov` bytes. mp4box parses the sample
 * tables; this walker pulls out the metadata mp4box does not decode into usable values:
 *  - moov/meta and moov/udta/meta (handler 'mdta') keys + ilst: e.g. com.apple.quicktime.make,
 *    com.apple.quicktime.full-frame-rate-playback-intent, com.android.capture.fps
 *  - moov/udta classic text atoms (©mak, ©mod, ©swr, ...) and udta/meta/ilst fourcc items
 *  - timed-metadata tracks ('mebx' sample entries): the key names they declare
 *    (values live in media samples and are not read here)
 * Tolerant by design: malformed atoms are skipped, never thrown.
 */

export type MetadataValue = string | number | boolean | Uint8Array

export interface TimedMetadataTrack {
  trackId: number
  keys: string[]
}

export interface ContainerMetadata {
  /** Movie-level mdta items keyed by full key name, e.g. 'com.apple.quicktime.make'. */
  movie: Record<string, MetadataValue>
  /** udta items keyed by atom type, e.g. '©mak', '©too'. */
  userData: Record<string, MetadataValue>
  /** Track-level mdta items keyed by `${trackId}:${key}`. */
  track: Record<string, MetadataValue>
  timedMetadataTracks: TimedMetadataTrack[]
}

interface Atom {
  type: string
  /** Offset of the payload (after the header) within the buffer. */
  start: number
  /** End offset (exclusive). */
  end: number
}

function fourcc(view: DataView, at: number): string {
  let s = ''
  for (let i = 0; i < 4; i++) s += String.fromCharCode(view.getUint8(at + i))
  return s
}

function* childAtoms(view: DataView, start: number, end: number): Generator<Atom> {
  let pos = start
  while (pos + 8 <= end) {
    let size = view.getUint32(pos)
    const type = fourcc(view, pos + 4)
    let header = 8
    if (size === 1) {
      if (pos + 16 > end) return
      size = Number(view.getBigUint64(pos + 8))
      header = 16
    } else if (size === 0) {
      size = end - pos
    }
    if (size < header || pos + size > end) return
    yield { type, start: pos + header, end: pos + size }
    pos += size
  }
}

function findChild(view: DataView, parent: Atom, type: string): Atom | undefined {
  for (const atom of childAtoms(view, parent.start, parent.end)) if (atom.type === type) return atom
  return undefined
}

const utf8 = new TextDecoder('utf-8')

function decodeUtf16be(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1])
  return s
}

function readInt(view: DataView, at: number, len: number, signed: boolean): number | undefined {
  switch (len) {
    case 1:
      return signed ? view.getInt8(at) : view.getUint8(at)
    case 2:
      return signed ? view.getInt16(at) : view.getUint16(at)
    case 3: {
      const u = (view.getUint8(at) << 16) | view.getUint16(at + 1)
      return signed && u & 0x800000 ? u - 0x1000000 : u
    }
    case 4:
      return signed ? view.getInt32(at) : view.getUint32(at)
    case 8:
      return Number(signed ? view.getBigInt64(at) : view.getBigUint64(at))
    default:
      return undefined
  }
}

/**
 * Decodes a 'data' atom payload by its well-known type (QuickTime File Format,
 * "Well-known types"): 1 UTF-8, 2 UTF-16BE, 21 signed int, 22 unsigned int,
 * 23 float32, 24 float64, 65-67/74 int8/16/32/64, 75-78 uint8/16/32/64.
 */
export function decodeDataAtom(view: DataView, atom: Atom): MetadataValue | undefined {
  if (atom.end - atom.start < 8) return undefined
  const typeIndicator = view.getUint32(atom.start) & 0x00ffffff
  const valueStart = atom.start + 8 // skip type (4) + locale (4)
  const len = atom.end - valueStart
  const bytes = new Uint8Array(view.buffer, view.byteOffset + valueStart, len)
  const fixedSize: Record<number, number> = { 65: 1, 66: 2, 67: 4, 74: 8, 75: 1, 76: 2, 77: 4, 78: 8 }
  if (fixedSize[typeIndicator] !== undefined && fixedSize[typeIndicator] !== len) return bytes.slice()
  switch (typeIndicator) {
    case 1:
      return utf8.decode(bytes)
    case 2:
      return decodeUtf16be(bytes)
    case 21:
      return readInt(view, valueStart, len, true) ?? bytes.slice()
    case 22:
      return readInt(view, valueStart, len, false) ?? bytes.slice()
    case 23:
      return len === 4 ? view.getFloat32(valueStart) : bytes.slice()
    case 24:
      return len === 8 ? view.getFloat64(valueStart) : bytes.slice()
    case 65:
      return view.getInt8(valueStart)
    case 66:
      return view.getInt16(valueStart)
    case 67:
      return view.getInt32(valueStart)
    case 74:
      return Number(view.getBigInt64(valueStart))
    case 75:
      return view.getUint8(valueStart)
    case 76:
      return view.getUint16(valueStart)
    case 77:
      return view.getUint32(valueStart)
    case 78:
      return Number(view.getBigUint64(valueStart))
    default:
      return bytes.slice()
  }
}

/** keys atom: version/flags, entry_count, then [size][namespace][key] entries. */
function parseKeys(view: DataView, keys: Atom): Map<number, string> {
  const out = new Map<number, string>()
  if (keys.end - keys.start < 8) return out
  const count = view.getUint32(keys.start + 4)
  let pos = keys.start + 8
  for (let i = 1; i <= count && pos + 8 <= keys.end; i++) {
    const size = view.getUint32(pos)
    if (size < 8 || pos + size > keys.end) break
    const name = utf8.decode(new Uint8Array(view.buffer, view.byteOffset + pos + 8, size - 8))
    out.set(i, name)
    pos += size
  }
  return out
}

/** ilst children are [size][key index or fourcc] containers holding a 'data' atom. */
function parseIlst(view: DataView, ilst: Atom, keyNames: Map<number, string> | null): Record<string, MetadataValue> {
  const out: Record<string, MetadataValue> = {}
  let pos = ilst.start
  while (pos + 8 <= ilst.end) {
    const size = view.getUint32(pos)
    if (size < 8 || pos + size > ilst.end) break
    const item: Atom = { type: fourcc(view, pos + 4), start: pos + 8, end: pos + size }
    const name = keyNames ? keyNames.get(view.getUint32(pos + 4)) : item.type
    try {
      const data = findChild(view, item, 'data')
      if (name && data) {
        const value = decodeDataAtom(view, data)
        if (value !== undefined) out[name] = value
      }
    } catch {
      // A malformed item must not hide the others.
    }
    pos += size
  }
  return out
}

/** QuickTime 'meta' is a plain atom; ISO 'meta' is a full box (4 extra bytes). */
function metaChildrenStart(view: DataView, meta: Atom): number {
  if (meta.end - meta.start >= 8) {
    const firstType = fourcc(view, meta.start + 4)
    if (['hdlr', 'keys', 'ilst', 'mhdr', 'ctry', 'lang'].includes(firstType)) return meta.start
  }
  return meta.start + 4
}

/** Items of a meta atom; keyed = true when names come from an mdta 'keys' table. */
function parseMetaAtom(view: DataView, meta: Atom): { keyed: boolean; items: Record<string, MetadataValue> } {
  const inner: Atom = { type: 'meta', start: metaChildrenStart(view, meta), end: meta.end }
  const keysAtom = findChild(view, inner, 'keys')
  const ilst = findChild(view, inner, 'ilst')
  const keyed = keysAtom !== undefined
  if (!ilst) return { keyed, items: {} }
  return { keyed, items: parseIlst(view, ilst, keysAtom ? parseKeys(view, keysAtom) : null) }
}

/** Classic udta text atom: [uint16 length][uint16 language][text]. */
function parseUdtaText(view: DataView, atom: Atom): string | undefined {
  if (atom.end - atom.start < 4) return undefined
  const len = view.getUint16(atom.start)
  if (len === 0 || atom.start + 4 + len > atom.end) return undefined
  return utf8.decode(new Uint8Array(view.buffer, view.byteOffset + atom.start + 4, len))
}

/**
 * udta: classic text atoms and iTunes-style fourcc items go to userData; mdta-keyed
 * items (ffmpeg writes them here, Apple uses moov/meta) go to movie.
 */
function parseUdta(view: DataView, udta: Atom, result: ContainerMetadata): void {
  for (const atom of childAtoms(view, udta.start, udta.end)) {
    if (atom.type === 'meta') {
      const { keyed, items } = parseMetaAtom(view, atom)
      Object.assign(keyed ? result.movie : result.userData, items)
    } else if (atom.type.charCodeAt(0) === 0xa9) {
      const text = parseUdtaText(view, atom)
      if (text !== undefined) result.userData[atom.type] = text
    }
  }
}

function trackIdOf(view: DataView, trak: Atom): number {
  const tkhd = findChild(view, trak, 'tkhd')
  if (!tkhd) return -1
  const version = view.getUint8(tkhd.start)
  const idAt = tkhd.start + 4 + (version === 1 ? 16 : 8)
  return idAt + 4 <= tkhd.end ? view.getUint32(idAt) : -1
}

/**
 * Keys declared by a 'mebx' sample entry: keys atom -> one atom per local key id ->
 * 'keyd' atom holding [namespace fourcc][key value]. Best effort; not validated on
 * real iPhone files in this repo (no real footage available).
 */
function mebxKeys(view: DataView, entry: Atom): string[] {
  const keys: string[] = []
  // Sample entry header: 6 reserved bytes + uint16 data_reference_index.
  const body: Atom = { type: 'mebx', start: entry.start + 8, end: entry.end }
  const keysAtom = findChild(view, body, 'keys')
  if (!keysAtom) return keys
  for (const keyAtom of childAtoms(view, keysAtom.start, keysAtom.end)) {
    const keyd = findChild(view, keyAtom, 'keyd')
    if (!keyd || keyd.end - keyd.start < 4) continue
    keys.push(utf8.decode(new Uint8Array(view.buffer, view.byteOffset + keyd.start + 4, keyd.end - keyd.start - 4)))
  }
  return keys
}

function timedMetadataKeys(view: DataView, trak: Atom): string[] {
  const path = ['mdia', 'minf', 'stbl', 'stsd']
  let node: Atom | undefined = trak
  for (const type of path) {
    node = node && findChild(view, node, type)
    if (!node) return []
  }
  // stsd: version/flags + entry_count, then sample entries.
  const keys: string[] = []
  for (const entry of childAtoms(view, node.start + 8, node.end)) {
    if (entry.type === 'mebx') keys.push(...mebxKeys(view, entry))
  }
  return keys
}

/**
 * Parses metadata from the bytes of a `moov` atom (including its 8-byte header) or of
 * a buffer that contains top-level atoms with a moov among them.
 */
export function parseMoovMetadata(bytes: Uint8Array): ContainerMetadata {
  const result: ContainerMetadata = { movie: {}, userData: {}, track: {}, timedMetadataTracks: [] }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let moov: Atom | undefined
  for (const atom of childAtoms(view, 0, bytes.byteLength)) if (atom.type === 'moov') moov = atom
  if (!moov) return result

  try {
    for (const atom of childAtoms(view, moov.start, moov.end)) {
      if (atom.type === 'meta') Object.assign(result.movie, parseMetaAtom(view, atom).items)
      else if (atom.type === 'udta') parseUdta(view, atom, result)
      else if (atom.type === 'trak') {
        const trackId = trackIdOf(view, atom)
        const meta = findChild(view, atom, 'meta')
        if (meta) {
          for (const [key, value] of Object.entries(parseMetaAtom(view, meta).items)) result.track[`${trackId}:${key}`] = value
        }
        const keys = timedMetadataKeys(view, atom)
        if (keys.length) result.timedMetadataTracks.push({ trackId, keys })
      }
    }
  } catch {
    // Truncated or unusual atoms: keep whatever was decoded before the problem.
  }
  return result
}

/** Numeric view of a metadata value (ffmpeg writes numbers as strings). */
export function metadataNumber(value: MetadataValue | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim())
    return Number.isFinite(n) ? n : undefined
  }
  if (value instanceof Uint8Array && value.length === 1) return value[0]
  return undefined
}

export function metadataString(value: MetadataValue | undefined): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

/** Well-known keys this module interprets. */
export const QT_KEYS = {
  make: 'com.apple.quicktime.make',
  model: 'com.apple.quicktime.model',
  software: 'com.apple.quicktime.software',
  creationDate: 'com.apple.quicktime.creationdate',
  /** iOS 18 / macOS 15: 1 = play at full frame rate, 0 = play as slow motion (Apple AVFoundation docs). */
  fullFrameRatePlaybackIntent: 'com.apple.quicktime.full-frame-rate-playback-intent',
  androidCaptureFps: 'com.android.capture.fps',
  androidManufacturer: 'com.android.manufacturer',
  androidModel: 'com.android.model',
} as const
