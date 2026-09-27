import { StubScreen } from '../StubScreen.tsx'

/** Progress tab root (DESIGN §10.10, PRODUCT §6.9): question tiles with trends, experiments, comp nights. */
export function ProgressScreen() {
  return (
    <StubScreen
      title="Progress"
      variant="root"
      purpose="Answer: is my toss getting more consistent, am I getting more first serves in, is my rhythm steady, am I contacting higher, am I using my legs. Matched sessions only; sample data never appears here."
      specs={['DESIGN §10.10', 'DESIGN §9.2', 'PRODUCT §6.9']}
    />
  )
}
