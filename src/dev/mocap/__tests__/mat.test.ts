/**
 * The MAT-file reader and the Bath conversion helpers, on bytes built here.
 *
 * The real files are fetched, not committed, so the reader is held to files
 * written by hand: the element framing (including the small-element form a
 * one-letter name uses), a compressed element, and the formats it must refuse
 * by name rather than misread.
 */
import { assert, check, heading, near, report } from '../../../lib/analysis/__tests__/harness'
import { harringtonHips, parseOutcomes } from '../bath'
import { readMat } from '../mat'

/** Little-endian bytes, padded to 8 the way MAT elements are. */
class Writer {
  bytes: number[] = []
  u32(v: number) {
    for (let i = 0; i < 4; i++) this.bytes.push((v >>> (8 * i)) & 0xff)
  }
  i32(v: number) {
    this.u32(v >>> 0)
  }
  f64(v: number) {
    const b = new Uint8Array(new Float64Array([v]).buffer)
    this.bytes.push(...b)
  }
  pad() {
    while (this.bytes.length % 8) this.bytes.push(0)
  }
}

/** A double matrix element: flags, dimensions, name, real part. */
function matrixElement(name: string, dims: number[], values: number[]): number[] {
  const body = new Writer()
  body.u32(6) // miUINT32 flags
  body.u32(8)
  body.u32(6) // mxDOUBLE_CLASS
  body.u32(0)
  body.u32(5) // miINT32 dimensions
  body.u32(dims.length * 4)
  for (const d of dims) body.i32(d)
  body.pad()
  if (name.length <= 4) {
    // Small element: count in the top half of the tag, data in the next four bytes.
    body.u32((name.length << 16) | 1)
    for (let i = 0; i < 4; i++) body.bytes.push(i < name.length ? name.charCodeAt(i) : 0)
  } else {
    body.u32(1)
    body.u32(name.length)
    for (const c of name) body.bytes.push(c.charCodeAt(0))
    body.pad()
  }
  body.u32(9) // miDOUBLE
  body.u32(values.length * 8)
  for (const v of values) body.f64(v)
  const el = new Writer()
  el.u32(14) // miMATRIX
  el.u32(body.bytes.length)
  el.bytes.push(...body.bytes)
  return el.bytes
}

function header(text = 'MATLAB 5.0 MAT-file, built by mat.test.ts'): number[] {
  const h = new Array(128).fill(0x20)
  for (let i = 0; i < text.length; i++) h[i] = text.charCodeAt(i)
  for (let i = 116; i < 124; i++) h[i] = 0
  h[124] = 0x00
  h[125] = 0x01
  h[126] = 0x49 // 'I'
  h[127] = 0x4d // 'M'
  return h
}

const never = () => {
  throw new Error('nothing here is compressed')
}

heading('MAT-file reader')

check('reads a double array with its name and MATLAB-order dimensions', () => {
  const file = new Uint8Array([...header(), ...matrixElement('A', [2, 3], [1, 2, 3, 4, 5, 6])])
  const [a] = readMat(file, never)
  assert(a.name === 'A', `name ${a.name}`)
  assert(a.dims.join() === '2,3', `dims ${a.dims}`)
  assert(Array.from(a.data).join() === '1,2,3,4,5,6', `data ${Array.from(a.data)}`)
})

check('reads a long name and several arrays in order', () => {
  const file = new Uint8Array([
    ...header(),
    ...matrixElement('Serves3D', [1, 1], [7]),
    ...matrixElement('B', [1, 2], [8, 9]),
  ])
  const arrays = readMat(file, never)
  assert(arrays.map((a) => a.name).join() === 'Serves3D,B', `names ${arrays.map((a) => a.name)}`)
  assert(arrays[1].data[1] === 9, 'second array read')
})

check('opens a compressed element through the inflate it is given', () => {
  const inner = matrixElement('Z', [1, 1], [42])
  const outer = new Writer()
  outer.u32(15) // miCOMPRESSED, not padded
  outer.u32(inner.length)
  outer.bytes.push(...inner)
  let called = 0
  const file = new Uint8Array([...header(), ...outer.bytes])
  // Stored "compressed" as-is, with an identity inflate: the framing is what is under test.
  const [z] = readMat(file, (b) => {
    called++
    return b
  })
  assert(called === 1, 'inflate called once')
  assert(z.data[0] === 42, `value ${z.data[0]}`)
})

check('refuses v7.3 and big-endian files by name', () => {
  const v73 = new Uint8Array([...header('MATLAB 7.3 MAT-file'), ...matrixElement('A', [1, 1], [1])])
  let msg = ''
  try {
    readMat(v73, never)
  } catch (e) {
    msg = (e as Error).message
  }
  assert(/v7\.3/.test(msg), `v7.3 refused: ${msg}`)
  const big = header()
  big[126] = 0x4d
  big[127] = 0x49
  msg = ''
  try {
    readMat(new Uint8Array(big), never)
  } catch (e) {
    msg = (e as Error).message
  }
  assert(/little-endian/.test(msg), `big-endian refused: ${msg}`)
})

heading('Bath conversion helpers')

check('Harrington hips sit symmetrically below and behind the front of the pelvis', () => {
  // A level pelvis facing +x: ASIS 0.25 m apart, PSIS 0.17 m behind.
  const hips = harringtonHips(
    { x: 0, y: -0.125, z: 1 },
    { x: 0, y: 0.125, z: 1 },
    { x: -0.17, y: -0.04, z: 1 },
    { x: -0.17, y: 0.04, z: 1 },
  )
  // x = −0.24·0.17 − 0.0099, y(superior) = −0.30·0.25 − 0.0109, z(right) = 0.33·0.25 + 0.0073.
  near(hips.right.x, -0.0507, 1e-4, 'behind the ASIS line')
  near(hips.right.z, 1 - 0.0859, 1e-4, 'below the ASIS')
  near(hips.right.y, -0.0898, 1e-4, 'right hip lateral offset')
  near(hips.left.y, 0.0898, 1e-4, 'left hip mirrors it')
})

check('outcomes are read from the sheet, trimmed, and blank rows skipped', () => {
  const shared = ['Serve', 'Outcome', 'Net', 'In', 'N/A', 'Net ', 'Out']
  const row = (r: number, cells: string) => `<row r="${r}" spans="1:4">${cells}</row>`
  const xml = [
    row(1, '<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c>'),
    row(2, '<c r="A2"/><c r="C2" t="s"><v>4</v></c>'),
    row(3, '<c r="A3"><v>1</v></c><c r="B3" t="s"><v>2</v></c>'),
    row(4, '<c r="A4"><v>2</v></c><c r="B4" t="s"><v>3</v></c><c r="C4"><v>3.1</v></c>'),
    row(5, '<c r="A5"><v>58</v></c><c r="B5" t="s"><v>5</v></c>'),
    row(6, '<c r="A6"><v>61</v></c><c r="B6" t="s"><v>6</v></c>'),
    row(7, '<c r="A7"><v>115</v></c>'),
  ].join('')
  const out = parseOutcomes(xml, shared)
  assert(out.get(1) === 'net' && out.get(2) === 'in' && out.get(58) === 'net' && out.get(61) === 'out', 'read')
  assert(!out.has(115), 'a serve with no outcome is left out')
  assert(out.size === 4, `${out.size} rows`)
})

report()
