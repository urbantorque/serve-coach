/**
 * Multi-select with exclusive options (PRODUCT O3 "No comp" and O7 "None"): choosing an exclusive
 * option clears the others, and choosing any other option clears the exclusive ones.
 */
export function toggleChoice<T extends string>(current: readonly T[], value: T, exclusive: readonly T[] = []): T[] {
  if (current.includes(value)) return current.filter((v) => v !== value)
  if (exclusive.includes(value)) return [value]
  return [...current.filter((v) => !exclusive.includes(v)), value]
}

/** Keeps a stable, option-ordered list (so stored arrays do not depend on tap order). */
export function inOptionOrder<T extends string>(values: readonly T[], options: readonly { value: T }[]): T[] {
  return options.map((o) => o.value).filter((v) => values.includes(v))
}
