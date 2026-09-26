/** Codec-string helpers for WebCodecs configuration. Pure functions. */

export type CodecFamily = 'h264' | 'hevc' | 'dolby-vision' | 'vp9' | 'vp8' | 'av1' | 'prores' | 'other'

export function codecFamily(codec: string): CodecFamily {
  const fourcc = codec.slice(0, 4)
  if (fourcc === 'avc1' || fourcc === 'avc3') return 'h264'
  if (fourcc === 'hvc1' || fourcc === 'hev1') return 'hevc'
  if (fourcc === 'dvh1' || fourcc === 'dvhe') return 'dolby-vision'
  if (fourcc === 'vp09' || codec === 'vp9') return 'vp9'
  if (fourcc === 'vp08' || codec === 'vp8') return 'vp8'
  if (fourcc === 'av01') return 'av1'
  if (/^ap(4h|4x|cn|cs|co|ch)$/.test(fourcc)) return 'prores'
  return 'other'
}

export interface HevcProfileFields {
  general_profile_space: number
  general_tier_flag: number
  general_profile_idc: number
  general_profile_compatibility: number
  general_constraint_indicator: ArrayLike<number>
  general_level_idc: number
}

function reverseBits32(value: number): number {
  let v = value >>> 0
  let out = 0
  for (let i = 0; i < 32; i++) {
    out = (out << 1) | (v & 1)
    v >>>= 1
  }
  return out >>> 0
}

/**
 * RFC 6381 / ISO/IEC 14496-15 Annex E codec string from hvcC fields, e.g.
 * 'hvc1.1.6.L93.B0'. Used to decode the HEVC base layer of Dolby Vision (dvh1)
 * iPhone HDR clips, whose own 'dvh1' string WebCodecs does not accept.
 */
export function hevcCodecString(prefix: 'hvc1' | 'hev1', f: HevcProfileFields): string {
  const space = ['', 'A', 'B', 'C'][f.general_profile_space] ?? ''
  const compat = reverseBits32(f.general_profile_compatibility).toString(16).toUpperCase()
  const tier = f.general_tier_flag ? 'H' : 'L'
  const constraints = Array.from(f.general_constraint_indicator)
  let last = constraints.length - 1
  while (last >= 0 && constraints[last] === 0) last--
  const constraintPart = constraints
    .slice(0, last + 1)
    .map((b) => '.' + b.toString(16).toUpperCase())
    .join('')
  return `${prefix}.${space}${f.general_profile_idc}.${compat}.${tier}${f.general_level_idc}${constraintPart}`
}
