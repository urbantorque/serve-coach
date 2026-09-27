/**
 * Unit test for tools/validate/annotation-eval.ts with synthetic annotations (no real footage).
 *
 *   app/node_modules/.bin/tsx --test tools/validate/annotation-eval.test.ts
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { syntheticExport } from '../../app/src/validation/annotation/synthetic.ts'
import { parseArgs, readParticipants, run } from './annotation-eval.ts'

const dir = mkdtempSync(join(tmpdir(), 'annotation-eval-'))
after(() => rmSync(dir, { recursive: true, force: true }))

// Two phones (two exports), eight and four players; the first with a known toss-height bias and
// entries that must be left out (sample data, marks changed after the comparison was shown).
const a = syntheticExport({ seed: 21, players: 8, servesPerPlayer: 20, bias: { apexPct: 2 }, sampleEntries: 2, unblindedEntries: 3, subjectPrefix: 'phoneA' })
const b = syntheticExport({ seed: 22, players: 4, servesPerPlayer: 10, bias: { apexPct: 2 }, subjectPrefix: 'phoneB' })
const inputs = join(dir, 'in')
const nested = join(inputs, 'coach-club')
mkdirSync(nested, { recursive: true })
writeFileSync(join(inputs, 'serve-coach-validation@1-2026-09-27.json'), JSON.stringify(a))
writeFileSync(join(nested, 'serve-coach-validation@1-2026-09-28.json'), JSON.stringify(b))
writeFileSync(join(inputs, 'notes.json'), JSON.stringify({ hello: 'not an export' }))
writeFileSync(join(inputs, 'broken.json'), '{ nope')
const participants = join(dir, 'participants.csv')
writeFileSync(participants, 'subjectKey,sex,ageBand,utrBand\nphoneA-01,female,30-44,3-4.99\nphoneA-02,male,18-29,1-2.99\n')

describe('annotation-eval', () => {
  const out = join(dir, 'out')
  const r = run({ inputs: [inputs], outDir: out, participantsPath: participants, now: new Date(2026, 8, 27) })

  it('reads every export under the folders and says why other files were skipped', () => {
    assert.equal(r.files.length, 2)
    assert.deepEqual(r.skipped.map((s) => s.reason).sort(), ['not a serve-coach-validation@1 file', 'not valid JSON'])
    assert.equal(r.result.inputs.players, 12)
    assert.equal(r.result.inputs.servesUsed, 8 * 20 + 4 * 10)
    assert.equal(r.result.inputs.leftOutSample, 2)
    assert.equal(r.result.inputs.leftOutUnblinded, 3)
  })

  it('recovers the injected bias and judges against the METRICS targets', () => {
    const toss = r.result.metrics.find((m) => m.id === 'toss-apex-height')!
    assert.ok(toss.ba && toss.ba.bias > 1.5 && toss.ba.bias < 2.5, `bias ${toss.ba?.bias}`)
    assert.equal(toss.ba!.method, 'repeated')
    assert.ok(toss.icc && toss.icc.icc > 0.6, `ICC ${toss.icc?.icc}`)
    assert.equal(toss.verdict, 'Meets the V2 target')
    const contact = r.result.events.find((e) => e.event === 'contact')!
    assert.ok(contact.dist!.within[1] > 0.8)
  })

  it('writes the markdown report and a JSON copy, with the current levels from metrics.json', () => {
    const md = readFileSync(r.reportPath, 'utf8')
    assert.match(md, /^# Real-footage validation: app against hand marks/)
    assert.match(md, /\| Players \(V2 stage\) \| ≥ 8 \| 12 \| yes \|/)
    assert.match(md, /\| Women \| ≥ 12 \| 1 \| not yet \|/)
    assert.match(md, /## Metrics: app against the marks/)
    assert.match(md, /\| Toss height \| % of height \| 200 \(12\) \|/)
    assert.match(md, /## What a pass would allow/)
    assert.match(md, /\| Toss-to-hit time \| day V\d, overcast V\d, night-lights V\d, flicker V\d \| V2 ceiling is measured/)
    assert.match(md, /\| Toss height \| day V\d, .* \| V2 ceiling is estimated \(spatial\)/)
    assert.doesNotMatch(md, /NaN|undefined/)
    const json = JSON.parse(readFileSync(r.jsonPath, 'utf8'))
    assert.equal(json.result.inputs.players, 12)
    assert.equal(json.files.length, 2)
  })

  it('covers leg drive, loading, drive time and the shoulder line from hip and shoulder marks (product-gaps)', () => {
    const md = readFileSync(r.reportPath, 'utf8')
    assert.match(md, /\| Leg drive \(hip rise\) \| % of height \| 200 \(12\) \|/)
    assert.match(md, /\| Loading \(hip dip\) \| % of height \| 200 \(12\) \|/)
    assert.match(md, /\| Drive time \| ms \| 200 \(12\) \|.*MAE ≤ 2 frames/)
    assert.match(md, /\| Shoulder line at the top \| degrees \| 200 \(12\) \|.*Reported only: the band is judged by coach agreement/)
    assert.match(md, /\| Drive time \| day V\d, .* \| V2 ceiling is measured \(timing metric\), in the condition classes tested; its designed status is estimated \|/)
    assert.match(md, /\| Trophy position \| 200 \(12\) \|.*Reported only/)
    const legs = r.result.metrics.find((m) => m.id === 'leg-drive')!
    assert.equal(legs.verdict, 'Meets the V2 target')
  })

  it('parses its arguments and the participants file', () => {
    assert.deepEqual(parseArgs(['x.json', '--out', 'o', '--include-sample', 'dir']), { inputs: ['x.json', 'dir'], outDir: 'o', includeSample: true })
    assert.throws(() => parseArgs(['--bogus']), /Unknown option/)
    assert.throws(() => run({ inputs: [] }), /at least one/)
    assert.deepEqual(readParticipants(participants)['phoneA-01'], { sex: 'female', ageBand: '30-44', utrBand: '3-4.99' })
  })
})
