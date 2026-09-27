Coaching engine (COACHING.md, coaching-library.json): turns per-serve metrics and player tags into one
decision per session (D6), never overstating what the footage supports. Framework-free and deterministic.

- `decideFocus(input: CoachingInput) => CoachingDecision`: safety gate (pain, red flags, active referral)
  -> under-18 -> match day -> data gate -> coach's focus -> active experiment -> detection -> rank
  (earlier stage, outcome gap, goal, mechanical first, confidence, library order) -> focus or keep going.
  Kinds: `focus`, `keep-going`, `capture-fix`, `referral`, `match-day`, `not-available`.
- `detectItem` (detect.ts): per-serve prevalence, spread lower bound, band, outcome, relative-to-your-best
  and composite ball-drop rules (COACHING §6.2), evaluated per stratum; views never mix.
- Experiment loop (experiment.ts): `experimentFromDecision`, `retestKind`, `retestDue`, `matchedComparison`
  (METRICS §4.5 verdict; inject the canonical `analysis/stats` one via `CoachingInput.verdict`, otherwise
  the fallback in verdict.ts runs), `sameSessionCheck` ("Straight after practice", display only) and
  `experimentTransition` (§12.5).
- Pain and referral copy (safety.ts) is verbatim COACHING §10 and needs clinical review before release.
- `toCoachingRecord(decision, { sessionId })` (record.ts) maps a decision to the stored ARCHITECTURE record.
- `library.json` is a byte copy of `docs/specs/coaching-library.json`; `library.test.ts` fails if they drift
  and runs the §14 content lint. `testkit.ts` builds sessions with exact statistics for tests.
