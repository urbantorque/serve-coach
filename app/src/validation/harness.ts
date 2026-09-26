// Dev-only validation harness entry (validation.html). Stub: the synthetic
// ground-truth runner will mount here and report metric error against truth.
const harnessRoot = document.getElementById('harness')

if (harnessRoot) {
  const heading = document.createElement('h1')
  heading.textContent = 'Validation harness'
  const note = document.createElement('p')
  note.textContent = 'No validation suites are registered yet.'
  harnessRoot.append(heading, note)
}
