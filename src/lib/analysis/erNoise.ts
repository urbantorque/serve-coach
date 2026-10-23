/*
 * What the shoulder's external-rotation reading is worth, on its own (Q12).
 *
 * Moved out of `diagnose.ts` so `carryForward.ts`, which the glance and the
 * entry chunk load, can read the two numbers without loading the diagnosis.
 * `diagnose.ts` re-exports both.
 */

/**
 * Degrees of external-rotation reading injected by one degree of spine lean.
 *
 * The reading is taken against the trunk's up vector, so leaning the trunk moves
 * the reference and the number follows even though the shoulder has not rotated.
 *
 * A BOUND, NOT A COEFFICIENT, since the rig's arm was re-posed on the Bath
 * serves. `depth.test.ts` measured 15.1° of shift across 30° of lean on the old
 * arm (hand behind the racket shoulder) and 6° on the Bath-shaped one (hand
 * behind the head, elbow out to the side): 0.5 per degree and 0.2. How much a
 * lean moves the reference depends on where the arm sits relative to the lean,
 * so no single coefficient is the arm's — and the larger of the two measured is
 * kept, because every consumer uses this to size a bound, and a bound wants the
 * worst arm it has seen.
 *
 * IT IS ADDITIVE on each arm, which is what lets it be a number at all. Swept
 * across four rotations by four leans, the shift lean causes is the same at
 * rotations of 0, 20, 40 and 60 to within a degree on both arms.
 *
 * NOTHING SUBTRACTS IT, and that is deliberate. `Diagnosis` returns what was
 * measured; a corrected number that silently differs from the geometry is exactly
 * the kind of confident adjustment this codebase does not make in the data layer.
 * The correction is also rig-derived — it assumes this rig's spine bends the way a
 * spine does — which is fine for deciding whether a comparison is worth making and
 * not fine for changing a reading nobody can check. `signals.spine_lean_deg`
 * carries the lean on the same diagnosis, so any consumer holding two serves has
 * both halves.
 *
 * What it is FOR: bounding a delta. Two serves whose lean differs by L degrees
 * carry up to `0.5 × L` degrees of false rotation change between them, which against
 * this reading's own ~15° deviation says a lean difference of ten degrees spends
 * a third of the floor before the shoulder has done anything.
 */
export const ER_LEAN_SENSITIVITY = 0.5

/**
 * Deviation of the external-rotation reading, the worse end of its measured range.
 *
 * `UNCALIBRATED.external_rotation_deg` records it as "flat at 9.4–11.8° across a
 * 48° span" — flat being the useful half, since a deviation that grew with the
 * reading could not be turned into a bound at all. The pessimistic end is
 * exported because a consumer bounding a delta wants the worst case on at least
 * one side of it.
 *
 * In prose until now, like the landing figures above and for the same reason:
 * arithmetic on a number nobody can import is arithmetic on a number somebody
 * retyped. Naming it changes nothing — nothing in this file reads it.
 */
export const ER_DEVIATION_DEG = 11.8
