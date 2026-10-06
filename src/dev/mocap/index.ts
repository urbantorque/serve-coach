/**
 * What `scripts/bench-mocap.mjs` bundles. File reading stays in the script, so
 * nothing under `src` needs Node's types.
 */
export { readMat } from './mat'
export { BATH_ATTRIBUTION, bathServe, parseOutcomes } from './bath'
export { PLACEMENTS, RATES, benchMocap, formatBench } from './report'
export { MOCAP_POINTS, packMocap, swingCompleted } from '../../lib/analysis/mocapServe'
