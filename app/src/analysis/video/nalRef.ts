/**
 * Disposable (non-reference) coded pictures, so the decoder can skip samples nobody needs.
 *
 * A picture that no other picture references can be left out of the decode without changing a
 * single pixel of any other frame. Frame selections that want one frame in n (Pass A's 4 Hz scan
 * decodes every frame of the clip to keep 1 in 15; Pass B's context grid; the pre-roll from a
 * keyframe to the first wanted frame) then decode fewer samples. On the synthetic corpus (libx264,
 * B-frames) 48% of samples are disposable; phone encoders that write only I and P pictures have none,
 * and nothing is skipped.
 *
 * H.264 (ISO/IEC 14496-10 §7.4.1): a picture is non-reference when every slice NAL unit has
 * nal_ref_idc 0. HEVC (ISO/IEC 23008-2 §7.4.2.2): a sub-layer non-reference picture (TRAIL_N, TSA_N,
 * STSA_N, RADL_N, RASL_N, RSV_VCL_N10/12/14) of the highest temporal sub-layer is referenced by
 * nothing. Samples are length-prefixed NAL units (avcC / hvcC).
 */

export interface NalFormat {
  codec: 'h264' | 'h265'
  /** Bytes of the NAL unit length prefix (1, 2 or 4). */
  lengthSize: number
  /** HEVC: highest TemporalId in the stream (hvcC numTemporalLayers - 1); unknown -> null. */
  maxTemporalId: number | null
}

/** NAL framing for a decoder codec string and its avcC / hvcC payload; null when not handled. */
export function nalFormatFor(decoderCodec: string, description: Uint8Array | undefined): NalFormat | null {
  if (!description) return null
  if (/^avc[13]\./.test(decoderCodec)) {
    if (description.length < 5 || description[0] !== 1) return null
    return { codec: 'h264', lengthSize: (description[4] & 3) + 1, maxTemporalId: 0 }
  }
  if (/^(hvc1|hev1)\./.test(decoderCodec)) {
    if (description.length < 23) return null
    const layers = (description[21] >> 3) & 7
    return { codec: 'h265', lengthSize: (description[21] & 3) + 1, maxTemporalId: layers > 0 ? layers - 1 : null }
  }
  return null
}

/** HEVC sub-layer non-reference VCL types (the even types below 16). */
function hevcNonReference(type: number): boolean {
  return type < 16 && type % 2 === 0
}

/**
 * True when the sample (one coded picture, length-prefixed NAL units) is referenced by no other
 * picture. False whenever that cannot be shown (no slice found, malformed lengths, unknown layers).
 */
export function isDisposable(sample: Uint8Array, format: NalFormat): boolean {
  if (format.lengthSize !== 1 && format.lengthSize !== 2 && format.lengthSize !== 4) return false
  let p = 0
  let slices = 0
  while (p + format.lengthSize < sample.length) {
    let size = 0
    for (let k = 0; k < format.lengthSize; k++) size = size * 256 + sample[p + k]
    const start = p + format.lengthSize
    if (size <= 0 || start + size > sample.length) return false
    const h0 = sample[start]
    if (format.codec === 'h264') {
      const type = h0 & 0x1f
      if (type >= 1 && type <= 5) {
        slices++
        if (type === 5 || ((h0 >> 5) & 3) !== 0) return false
      }
    } else {
      const type = (h0 >> 1) & 0x3f
      if (type < 32) {
        if (start + 1 >= sample.length || format.maxTemporalId === null) return false
        slices++
        const temporalId = (sample[start + 1] & 7) - 1
        if (!hevcNonReference(type) || temporalId !== format.maxTemporalId) return false
      }
    }
    p = start + size
  }
  return slices > 0
}
