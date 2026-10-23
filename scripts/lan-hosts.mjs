/**
 * Which addresses the LAN certificate names, and which the authority that
 * signs it may ever name. Pure, so `lanHosts.test.ts` can hold the two
 * together; `lan-preview.mjs` does the file and process work.
 *
 * The authority is installed on the player's own phone, and a root a phone
 * trusts could vouch for any site. So it is name-constrained to the private
 * ranges below and `localhost`: a phone that trusts it trusts it for this
 * computer on a home network or a tailnet, and for nothing on the internet.
 */

/** [network, mask]: RFC 1918, the shared range tailnets use, and loopback. */
export const PERMITTED = [
  ['10.0.0.0', '255.0.0.0'],
  ['172.16.0.0', '255.240.0.0'],
  ['192.168.0.0', '255.255.0.0'],
  ['100.64.0.0', '255.192.0.0'],
  ['127.0.0.0', '255.0.0.0'],
]

const toInt = (ip) => ip.split('.').reduce((n, octet) => n * 256 + Number(octet), 0)

/** Whether the authority may vouch for this IPv4 address. */
export function permitted(ip) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false
  const v = toInt(ip)
  return PERMITTED.some(([net, mask]) => ((v & toInt(mask)) >>> 0) === toInt(net))
}

/**
 * This computer's addresses a phone could reach, from `os.networkInterfaces()`:
 * IPv4 (Node 18.0–18.3 says `4`), not loopback, inside a permitted range, each
 * once. Virtual adapters (WSL, Hyper-V) come through too; naming them costs
 * nothing, and the list printed says which adapter each is on.
 */
export function lanHosts(interfaces) {
  const seen = new Set()
  const out = []
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const a of addresses ?? []) {
      const v4 = a.family === 'IPv4' || a.family === 4
      if (!v4 || a.internal || !permitted(a.address) || seen.has(a.address)) continue
      seen.add(a.address)
      out.push({ name, address: a.address })
    }
  }
  return out
}

/** The certificate's subjectAltName: this computer to itself, then to the phone. */
export function sanLine(hosts) {
  return ['DNS:localhost', 'IP:127.0.0.1', ...hosts.map((h) => `IP:${h.address}`)].join(',')
}

/** The authority's nameConstraints, from `PERMITTED`, so the two cannot drift. */
export function nameConstraintsLine() {
  return ['critical', ...PERMITTED.map(([net, mask]) => `permitted;IP:${net}/${mask}`), 'permitted;DNS:localhost'].join(',')
}
