/**
 * Just enough of the MATLAB level-5 MAT-file format to read a numeric array.
 *
 * The Bath serve dataset (`bath.ts`) ships each serve as one `.mat` file
 * holding one double array, 75 markers × 3 axes × 301 frames. Reading it needs
 * the 128-byte header, the tag/data element framing (including the "small
 * element" form that packs short data into the tag), zlib-compressed elements,
 * and a numeric matrix's flags, dimensions, name and real part. Structs, cells,
 * sparse, complex and the HDF5-based v7.3 format are not here and are refused
 * by name rather than misread.
 *
 * Dev only: nothing in the app imports this. It takes an `inflate` function
 * instead of importing `node:zlib`, so the module stays free of Node types and
 * the test can hand it Node's.
 */

export interface MatArray {
  name: string
  /** MATLAB order: the first dimension varies fastest. */
  dims: number[]
  data: Float64Array
}

const MI_INT8 = 1
const MI_UINT8 = 2
const MI_INT16 = 3
const MI_UINT16 = 4
const MI_INT32 = 5
const MI_UINT32 = 6
const MI_SINGLE = 7
const MI_DOUBLE = 9
const MI_MATRIX = 14
const MI_COMPRESSED = 15

/** mxCLASS ids for the numeric classes; everything else is refused. */
const NUMERIC_CLASSES = new Set([6, 7, 8, 9, 10, 11, 12, 13, 14, 15])

interface Element {
  type: number
  bytes: Uint8Array
}

function elements(buf: Uint8Array, start: number, end: number): Element[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const out: Element[] = []
  let off = start
  while (off + 8 <= end) {
    const first = view.getUint32(off, true)
    if (first >>> 16) {
      // Small element: byte count in the top half, type in the bottom, data in
      // the four bytes that would have held the count.
      const n = first >>> 16
      out.push({ type: first & 0xffff, bytes: buf.subarray(off + 4, off + 4 + n) })
      off += 8
      continue
    }
    const n = view.getUint32(off + 4, true)
    out.push({ type: first, bytes: buf.subarray(off + 8, off + 8 + n) })
    off += 8 + n
    // Compressed elements are not padded; everything else is, to 8 bytes.
    if (first !== MI_COMPRESSED) off += (8 - (n % 8)) % 8
  }
  return out
}

function numbers(el: Element): Float64Array {
  const { bytes } = el
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const read: Record<number, [number, (o: number) => number]> = {
    [MI_INT8]: [1, (o) => view.getInt8(o)],
    [MI_UINT8]: [1, (o) => view.getUint8(o)],
    [MI_INT16]: [2, (o) => view.getInt16(o, true)],
    [MI_UINT16]: [2, (o) => view.getUint16(o, true)],
    [MI_INT32]: [4, (o) => view.getInt32(o, true)],
    [MI_UINT32]: [4, (o) => view.getUint32(o, true)],
    [MI_SINGLE]: [4, (o) => view.getFloat32(o, true)],
    [MI_DOUBLE]: [8, (o) => view.getFloat64(o, true)],
  }
  const r = read[el.type]
  if (!r) throw new Error(`MAT: data type ${el.type} is not a numeric type this reader knows`)
  const [size, get] = r
  const out = new Float64Array(bytes.byteLength / size)
  for (let i = 0; i < out.length; i++) out[i] = get(i * size)
  return out
}

function matrix(bytes: Uint8Array): MatArray {
  const sub = elements(bytes, 0, bytes.byteLength)
  if (sub.length < 4) throw new Error('MAT: a matrix element is missing its parts')
  const flags = new DataView(sub[0].bytes.buffer, sub[0].bytes.byteOffset, 8).getUint32(0, true)
  const cls = flags & 0xff
  if (!NUMERIC_CLASSES.has(cls)) throw new Error(`MAT: class ${cls} is not a numeric array`)
  if (flags & 0x800) throw new Error('MAT: complex arrays are not supported')
  const dims = Array.from(numbers(sub[1]))
  const name = String.fromCharCode(...sub[2].bytes)
  return { name, dims, data: numbers(sub[3]) }
}

/** Every numeric array in the file, in the order they are stored. */
export function readMat(file: Uint8Array, inflate: (deflated: Uint8Array) => Uint8Array): MatArray[] {
  if (file.byteLength < 128) throw new Error('MAT: shorter than its own header')
  const text = String.fromCharCode(...file.subarray(0, 116))
  if (text.startsWith('MATLAB 7.3')) throw new Error('MAT: v7.3 files are HDF5 and are not supported')
  if (!text.startsWith('MATLAB 5.0')) throw new Error('MAT: not a level-5 MAT-file')
  if (file[126] !== 0x49 || file[127] !== 0x4d) throw new Error('MAT: only little-endian files are supported')

  const out: MatArray[] = []
  for (const el of elements(file, 128, file.byteLength)) {
    if (el.type === MI_MATRIX) out.push(matrix(el.bytes))
    else if (el.type === MI_COMPRESSED) {
      const inner = inflate(el.bytes)
      for (const e of elements(inner, 0, inner.byteLength)) if (e.type === MI_MATRIX) out.push(matrix(e.bytes))
    }
  }
  return out
}
