/**
 * The production build, served over HTTPS to a phone on the same network:
 * `npm run preview:lan` (run `npm run build` first).
 *
 * Plain `http://192.168.x.x` is not a secure context, so on a phone the camera
 * preview, the service worker (and with it offline) and installing to the home
 * screen all refuse to start. Only `localhost` is exempt, and a phone cannot
 * use this computer's localhost. A self-signed certificate is not enough
 * either: Chrome lets a page through a certificate warning but will not
 * register its service worker. The phone has to trust the certificate.
 *
 * So this keeps a small certificate authority of its own, installed once on
 * the phone, and signs a fresh certificate for this computer's current
 * addresses on every run (an address that changed is simply named next time).
 * The authority may only vouch for private addresses (`lan-hosts.mjs`).
 *
 * Both live in `~/.serve-coach/lan-cert` (or `LAN_CERT_DIR`), not in the
 * project: the project folder is synced, and the authority's key should not be.
 *
 * A plain-HTTP page on the next port hands the phone the authority's public
 * certificate, with the steps to trust it. Nothing here touches the network
 * beyond answering this computer's own two ports.
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lanHosts, nameConstraintsLine, sanLine } from './lan-hosts.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = process.env.LAN_CERT_DIR ? path.resolve(process.env.LAN_CERT_DIR) : path.join(os.homedir(), '.serve-coach', 'lan-cert')
const PORT = Number(process.env.LAN_PORT ?? 5280)
const CA_PORT = PORT + 1
const at = (name) => path.join(dir, name)

function openssl(args) {
  const r = spawnSync('openssl', args, { cwd: dir, encoding: 'utf8' })
  if (r.error) throw new Error(`openssl did not run (${r.error.message}). It ships with Git for Windows; put it on PATH.`)
  if (r.status !== 0) throw new Error(`openssl ${args[0]} failed:\n${r.stderr}`)
  return r.stdout
}

const P256 = ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes']

function ensureAuthority() {
  if (fs.existsSync(at('ca.pem')) && fs.existsSync(at('ca-key.pem'))) {
    // Thirty days' warning: an expired authority fails on the phone as a bare
    // certificate error, with nothing pointing here.
    const r = spawnSync('openssl', ['x509', '-in', at('ca.pem'), '-noout', '-checkend', String(30 * 86400)], { encoding: 'utf8' })
    if (r.status !== 0) console.warn(`The certificate authority expires within 30 days. Delete ${dir} and install the new one on the phone.`)
    return false
  }
  fs.writeFileSync(at('ca.cnf'), [
    '[req]', 'distinguished_name = dn', 'prompt = no', '[dn]', 'CN = Serve Coach LAN preview (private addresses only)',
    '[ca]', 'basicConstraints = critical,CA:TRUE,pathlen:0', 'keyUsage = critical,keyCertSign,cRLSign',
    'subjectKeyIdentifier = hash', `nameConstraints = ${nameConstraintsLine()}`, '',
  ].join('\n'))
  openssl(['req', '-x509', '-config', 'ca.cnf', '-extensions', 'ca', ...P256, '-keyout', 'ca-key.pem', '-out', 'ca.pem', '-days', '730'])
  return true
}

function issueLeaf(hosts) {
  fs.writeFileSync(at('leaf.cnf'), [
    '[req]', 'distinguished_name = dn', 'prompt = no', '[dn]', 'CN = Serve Coach on this computer',
    '[leaf]', 'basicConstraints = critical,CA:FALSE', 'keyUsage = critical,digitalSignature', 'extendedKeyUsage = serverAuth',
    'subjectKeyIdentifier = hash', 'authorityKeyIdentifier = keyid', `subjectAltName = ${sanLine(hosts)}`, '',
  ].join('\n'))
  openssl(['req', '-new', '-config', 'leaf.cnf', ...P256, '-keyout', 'lan-key.pem', '-out', 'lan.csr'])
  // 397 days: the longest a browser accepts for a server certificate.
  openssl(['x509', '-req', '-in', 'lan.csr', '-CA', 'ca.pem', '-CAkey', 'ca-key.pem', '-CAcreateserial',
    '-days', '397', '-extfile', 'leaf.cnf', '-extensions', 'leaf', '-out', 'lan-cert.pem'])
  fs.rmSync(at('lan.csr'))
}

const CA_PAGE = (httpsUrls) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0a0c10"><title>Trust this computer</title>
<style>:root{color-scheme:dark}body{font:16px/1.5 system-ui,sans-serif;margin:0 auto;max-width:34em;padding:16px;background:#0a0c10;color:#e8edf5}a{color:#c6f432}li{margin:.4em 0}</style>
<h1>Trust this computer, once</h1>
<p><a href="/ca.crt">Download the certificate</a>. It can only vouch for addresses on a private network, never a website.</p>
<h2>Android</h2>
<ol><li>Tap the link above.</li><li>Settings → Security → More security settings → Encryption &amp; credentials → Install a certificate → CA certificate, and pick <code>ca.crt</code>. (The path differs a little by phone; search Settings for “CA certificate”.)</li></ol>
<h2>iPhone</h2>
<ol><li>Open this page in Safari and tap the link; allow the profile.</li><li>Settings → General → VPN &amp; Device Management → install it.</li><li>Settings → General → About → Certificate Trust Settings → turn it on.</li></ol>
<h2>Then open</h2>
<ul>${httpsUrls.map((u) => `<li><a href="${u}">${u}</a></li>`).join('')}</ul>`

function serveAuthority(httpsUrls) {
  const cert = fs.readFileSync(at('ca.pem'))
  const page = CA_PAGE(httpsUrls)
  http.createServer((req, res) => {
    if (req.url === '/ca.crt') {
      res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="ca.crt"' })
      res.end(cert)
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(page)
    }
  }).listen(CA_PORT, '0.0.0.0')
}

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('No build to serve. Run `npm run build` first.')
  process.exit(1)
}

fs.mkdirSync(dir, { recursive: true })
const hosts = lanHosts(os.networkInterfaces())
const fresh = ensureAuthority()
issueLeaf(hosts)

const httpsUrls = hosts.map((h) => `https://${h.address}:${PORT}/`)
serveAuthority(httpsUrls)

const built = fs.statSync(path.join(root, 'dist', 'index.html')).mtime
console.log(`\nServe Coach over HTTPS, from the build of ${built.toLocaleString()}.\n`)
if (!hosts.length) console.log('  No private network address found: is this computer on Wi-Fi?\n')
for (const h of hosts) console.log(`  ${`https://${h.address}:${PORT}/`.padEnd(30)} ${h.name}`)
console.log(`\n${fresh ? 'A new certificate authority was made, so' : 'If this phone has not trusted this computer yet,'} open this on the phone first:`)
for (const h of hosts) console.log(`  http://${h.address}:${CA_PORT}/`)
console.log(`\nKeys in ${dir}. Windows may ask to let Node through the firewall: allow private networks.\n`)

const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const child = spawn(process.execPath, [vite, 'preview', '--host', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, LAN_TLS_DIR: dir },
})
child.on('exit', (code) => process.exit(code ?? 0))
