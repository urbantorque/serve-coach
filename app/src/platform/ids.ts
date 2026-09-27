/** ULID generator (ARCHITECTURE §3 platform/ids.ts): time-ordered, 26 Crockford base-32 characters. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function ulid(now: number = Date.now()): string {
  let time = ''
  let t = Math.floor(now)
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time
    t = Math.floor(t / 32)
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let rand = ''
  for (let i = 0; i < 16; i++) rand += ALPHABET[bytes[i] % 32]
  return time + rand
}

/** Local calendar date (YYYY-MM-DD) of an instant, in the device's time zone. */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
