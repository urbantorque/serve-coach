/**
 * Every ground-truth fixture the suite runs.
 *
 * Listed explicitly rather than discovered from the folder: the tests are
 * bundled by esbuild and run in Node with no filesystem access, and an explicit
 * list means adding a fixture is a reviewable one-line diff rather than
 * something that silently changes what CI checks.
 *
 * See README.md for how to capture and label one.
 */
import type { Fixture } from '../../groundTruth'

/**
 * Recorded clips. Empty until real footage is labelled — see README.md.
 *
 * Import each as JSON and add it here:
 *
 *   import sideOn30fps from './adult-side-30fps.fixture.json'
 *   export const RECORDED = [sideOn30fps as Fixture]
 */
export const RECORDED: Fixture[] = []

/**
 * The engine's accuracy claims rest entirely on RECORDED being non-empty. This
 * is the number the suite prints and warns about, kept here so there is exactly
 * one definition of "enough" and it is visible next to the empty list.
 *
 * Six is not a target so much as a floor: below it there is no chance of
 * covering both hands, more than one frame rate and more than one camera angle,
 * so a pass says nothing about footage unlike whatever happens to be here.
 */
export const MINIMUM_RECORDED = 6
