/**
 * Random-access byte reader over a File/Blob or an in-memory buffer. Lets the probe read
 * only the container boxes and the decoder read only the samples it needs, so a 300 MB
 * slow-motion clip never has to sit in memory as one ArrayBuffer.
 */
export interface ByteSource {
  readonly size: number
  /** Reads up to `length` bytes from `offset` (fewer at end of file). */
  read(offset: number, length: number): Promise<Uint8Array<ArrayBuffer>>
}

export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    async read(offset, length) {
      const end = Math.min(blob.size, offset + length)
      if (offset >= end) return new Uint8Array(0)
      return new Uint8Array(await blob.slice(offset, end).arrayBuffer())
    },
  }
}

export function bytesSource(input: ArrayBuffer | Uint8Array<ArrayBuffer>): ByteSource {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  return {
    size: bytes.byteLength,
    async read(offset, length) {
      const end = Math.min(bytes.byteLength, offset + length)
      return bytes.subarray(Math.min(offset, end), end)
    },
  }
}

export type ByteInput = Blob | ArrayBuffer | Uint8Array<ArrayBuffer> | ByteSource

function isByteSource(input: ByteInput): input is ByteSource {
  return typeof (input as ByteSource).read === 'function' && typeof (input as Blob).slice !== 'function'
}

export function toByteSource(input: ByteInput): ByteSource {
  if (input instanceof ArrayBuffer || input instanceof Uint8Array) return bytesSource(input)
  if (isByteSource(input)) return input
  return blobSource(input)
}

/** Copies a view into its own ArrayBuffer (mp4box needs a buffer it can own). */
export function toOwnedArrayBuffer(view: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(view.byteLength)
  new Uint8Array(out).set(view)
  return out
}

export type ContainerKind = 'mp4' | 'mov' | 'webm' | 'unknown'

/** Sniffs the container from the first bytes (ftyp / wide / mdat / moov atoms, or the EBML magic). */
export function sniffContainer(head: Uint8Array): ContainerKind {
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'webm'
  if (head.length < 12) return 'unknown'
  const type = String.fromCharCode(head[4], head[5], head[6], head[7])
  if (type === 'ftyp') {
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11])
    return brand === 'qt  ' ? 'mov' : 'mp4'
  }
  // Old QuickTime files can start with wide/free/mdat/moov instead of ftyp.
  if (['moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(type)) return 'mov'
  return 'unknown'
}
